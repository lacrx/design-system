import { readFileSync, existsSync } from 'fs';
import { join } from 'path';

const cwd = process.cwd();
const sourceArg = process.argv.find((a, i) => process.argv[i - 1] === '--source');
const tokensDir = join(cwd, sourceArg || 'tokens');

function validate() {
  let errors = 0;

  const primitivesPath = join(tokensDir, 'primitives.json');
  const semanticPath = join(tokensDir, 'semantic.json');

  if (!existsSync(primitivesPath)) {
    console.error('Missing', primitivesPath);
    errors++;
  } else {
    const primitives = JSON.parse(readFileSync(primitivesPath, 'utf8'));
    errors += validateTokenFile(primitives, 'primitives.json', false);
  }

  if (!existsSync(semanticPath)) {
    console.error('Missing', semanticPath);
    errors++;
  } else {
    const semantic = JSON.parse(readFileSync(semanticPath, 'utf8'));
    errors += validateTokenFile(semantic, 'semantic.json', true);
  }

  if (errors === 0) {
    console.log('Token files valid.');
  } else {
    console.error(`\n${errors} error(s) found.`);
    process.exit(1);
  }
}

function validateTokenFile(obj, filename, requireReferences, path = '') {
  let errors = 0;

  for (const [key, value] of Object.entries(obj)) {
    if (key.startsWith('$')) continue;

    const currentPath = path ? `${path}.${key}` : key;

    if (value && typeof value === 'object' && '$value' in value) {
      if (requireReferences && typeof value.$value === 'string' && !value.$value.match(/^\{.+\}$/)) {
        console.error(`${filename}: ${currentPath}.$value should be a reference (e.g. {color.blue.600}), got "${value.$value}"`);
        errors++;
      }
      // Composite values (objects like shadow) are valid in semantic files; skip reference check
    } else if (value && typeof value === 'object') {
      errors += validateTokenFile(value, filename, requireReferences, currentPath);
    }
  }

  return errors;
}

validate();
