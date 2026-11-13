import { readFileSync, existsSync, readdirSync } from 'fs';
import { join, resolve, relative, sep, basename } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
// The schema is draft 2020-12, which ajv only supports from this entry point;
// the default export is draft-07 and rejects the $schema key outright.
import Ajv2020 from 'ajv/dist/2020.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

const schema = JSON.parse(
  readFileSync(join(__dirname, 'tokens.schema.json'), 'utf8'),
);

const REFERENCE = /\{([^{}]+)\}/g;

/**
 * Files whose tokens must be references rather than literal values. The
 * semantic layer names roles; it must not invent values.
 */
function isSemanticFile(relPath) {
  const parts = relPath.split(sep);
  return (
    basename(relPath, '.json').toLowerCase().startsWith('semantic') ||
    parts.slice(0, -1).some((d) => d.toLowerCase() === 'semantic')
  );
}

function listTokenFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((e) => e.isFile() && e.name.endsWith('.json'))
    .map((e) => join(e.parentPath ?? e.path, e.name));
}

/**
 * Walk a parsed token file, calling visit() for every token with its dotted
 * path and the $type inherited from the nearest ancestor group.
 */
function walkTokens(node, visit, path = [], inheritedType = undefined) {
  const groupType = node.$type ?? inheritedType;

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (!value || typeof value !== 'object') continue;

    const currentPath = [...path, key];

    if ('$value' in value) {
      visit(currentPath, value, value.$type ?? groupType);
    } else {
      walkTokens(value, visit, currentPath, groupType);
    }
  }
}

/** Every {reference} inside a value, however deeply nested in a composite. */
function collectReferences(value, out = []) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(REFERENCE)) out.push(match[1]);
  } else if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectReferences(item, out);
  }
  return out;
}

function isPureReference(value) {
  return typeof value === 'string' && /^\{[^{}]+\}$/.test(value);
}

/**
 * Validate every token file under `source`.
 * Returns an array of human-readable error strings; empty means valid.
 */
export function validate({ source = 'tokens' } = {}) {
  const dir = resolve(source);
  const errors = [];

  if (!existsSync(dir)) {
    return [`Token source directory not found: ${dir}`];
  }

  const files = listTokenFiles(dir);
  if (files.length === 0) {
    return [`No .json token files found in ${dir}`];
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

    parsed.push({ relPath, json });
  }

  // Index every token before resolving, so a reference may point across files.
  const index = new Map();
  for (const { relPath, json } of parsed) {
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

  for (const { relPath, json } of parsed) {
    const semantic = isSemanticFile(relPath);

    walkTokens(json, (path, token, type) => {
      const dotted = path.join('.');
      const refs = collectReferences(token.$value);

      for (const ref of refs) {
        if (!index.has(ref)) {
          errors.push(
            `${relPath}: ${dotted} references {${ref}}, which is not defined in any token file`,
          );
        }
      }

      if (semantic && refs.length === 0) {
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
    });
  }

  return errors;
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

/** CLI wrapper: prints errors and returns the process exit code. */
export function runValidate(options = {}) {
  const errors = validate(options);

  if (errors.length === 0) {
    console.log('Token files valid.');
    return 0;
  }

  for (const error of errors) console.error(error);
  console.error(`\n${errors.length} error(s) found.`);
  return 1;
}
