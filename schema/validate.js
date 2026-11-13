import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve, relative, sep, basename, dirname } from 'path';
import { fileURLToPath } from 'url';
// The schema is draft 2020-12, which ajv only supports from this entry point;
// the default export is draft-07 and rejects the $schema key outright.
import Ajv2020 from 'ajv/dist/2020.js';
import { checkValue } from './values.js';
import {
  collectReferences,
  isPureReference,
  isRoleFile,
  isThemeFile,
  listTokenFiles,
  walkTokens,
} from './tokens.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const schema = JSON.parse(
  readFileSync(join(__dirname, 'tokens.schema.json'), 'utf8'),
);

/**
 * Validate every token file under `source`.
 *
 * Returns { errors, warnings }. Errors are violations that break the build or
 * the token contract. Warnings are pre-2025.10 value forms that still build;
 * `design-system validate --strict` promotes them to errors.
 */
export function validate({ source = 'tokens' } = {}) {
  const dir = resolve(source);
  const errors = [];
  const warnings = [];

  if (!existsSync(dir)) {
    return { errors: [`Token source directory not found: ${dir}`], warnings };
  }

  const files = listTokenFiles(dir);
  if (files.length === 0) {
    return { errors: [`No .json token files found in ${dir}`], warnings };
  }

  const Ajv = Ajv2020.default ?? Ajv2020;
  const ajv = new Ajv({ allErrors: true, strict: false });
  const validateSchema = ajv.compile(schema);

  const parsed = [];
  for (const file of files) {
    const relPath = relative(dir, file);
    let json;
    try {
      json = JSON.parse(readFileSync(file, 'utf8'));
    } catch (err) {
      errors.push(`${relPath}: not valid JSON (${err.message})`);
      continue;
    }

    if (!validateSchema(json)) {
      for (const err of dedupeAjvErrors(validateSchema.errors)) {
        const where = err.instancePath.replace(/^\//, '').split('/').join('.');
        errors.push(`${relPath}: ${where || '(root)'} ${err.message}`);
      }
      continue;
    }

    parsed.push({ relPath, json, theme: isThemeFile(relPath) });
  }

  // Index the base layer first, so a theme overlay can be checked against it
  // without its overrides counting as redefinitions.
  const index = new Map();
  for (const { relPath, json, theme } of parsed) {
    if (theme) continue;
    walkTokens(json, (path, token, type) => {
      const dotted = path.join('.');
      if (index.has(dotted)) {
        errors.push(
          `${relPath}: ${dotted} is already defined in ${index.get(dotted).relPath}`,
        );
        return;
      }
      index.set(dotted, { relPath, token, type });
    });
  }

  for (const { relPath, json, theme } of parsed) {
    const rolesOnly = isRoleFile(relPath);
    const seenInFile = new Set();

    walkTokens(json, (path, token, type) => {
      const dotted = path.join('.');
      const refs = collectReferences(token.$value);

      if (theme) {
        if (seenInFile.has(dotted)) {
          errors.push(`${relPath}: ${dotted} is defined twice in this theme`);
        }
        seenInFile.add(dotted);
      }

      for (const ref of refs) {
        if (!index.has(ref)) {
          errors.push(
            `${relPath}: ${dotted} references {${ref}}, which is not defined in any token file`,
          );
        }
      }

      if (rolesOnly && refs.length === 0) {
        errors.push(
          `${relPath}: ${dotted}.$value should reference a primitive (e.g. {color.blue.600}), got ${JSON.stringify(token.$value)}`,
        );
      }

      // A pure alias inherits its type from the token it points at.
      if (!type && !isPureReference(token.$value)) {
        errors.push(
          `${relPath}: ${dotted} has no $type, and none is set on an ancestor group`,
        );
      }

      // A value built from references is checked where the reference resolves.
      if (type && refs.length === 0) {
        const { error, legacy } = checkValue(type, token.$value);
        if (error) errors.push(`${relPath}: ${dotted} (${type}) ${error}`);
        if (legacy) warnings.push(`${relPath}: ${dotted} (${type}) uses ${legacy}`);
      }
    });
  }

  return { errors, warnings };
}

/** ajv reports every branch of a oneOf; keep the most specific one per path. */
function dedupeAjvErrors(ajvErrors) {
  const seen = new Set();
  return ajvErrors.filter((err) => {
    if (err.keyword === 'oneOf' || err.keyword === 'if') return false;
    const key = `${err.instancePath}|${err.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** CLI wrapper: prints findings and returns the process exit code. */
export function runValidate(options = {}) {
  const { errors, warnings } = validate(options);
  const strict = Boolean(options.strict);

  if (strict) {
    for (const warning of warnings) console.error(warning);
  }

  for (const error of errors) console.error(error);

  const failures = errors.length + (strict ? warnings.length : 0);

  if (failures === 0) {
    const note = warnings.length
      ? ` ${warnings.length} legacy value form(s); run with --strict to list them.`
      : '';
    console.log(`Token files valid.${note}`);
    return 0;
  }

  console.error(`\n${failures} error(s) found.`);
  return 1;
}
