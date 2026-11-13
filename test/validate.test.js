import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { validate } from '../schema/validate.js';
import { makeProject, repoRoot, PRIMITIVES, SEMANTIC } from './helpers.js';

function validateTokens(files) {
  const project = makeProject(
    Object.fromEntries(Object.entries(files).map(([name, body]) => [join('tokens', name), body])),
  );
  try {
    return validate({ source: join(project.dir, 'tokens') }).errors;
  } finally {
    project.cleanup();
  }
}

test('accepts a well-formed token set', () => {
  assert.deepEqual(validateTokens({ 'primitives.json': PRIMITIVES, 'semantic.json': SEMANTIC }), []);
});

test('accepts the shipped examples', () => {
  for (const name of ['minimal', 'full']) {
    const { errors, warnings } = validate({ source: join(repoRoot, 'examples', name) });
    assert.deepEqual(errors, [], `${name} example`);
    if (name === 'full') {
      // The full example is the one that demonstrates the 2025.10 value forms,
      // so it must be free of legacy-form warnings too.
      assert.deepEqual(warnings, [], 'full example should use the stable value forms');
    }
  }
});

test('catches a reference that resolves to nothing', () => {
  const errors = validateTokens({
    'primitives.json': PRIMITIVES,
    'semantic.json': { bg: { $type: 'color', primary: { $value: '{color.blue.999}' } } },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /references \{color\.blue\.999\}/);
});

test('catches a literal value in the semantic layer', () => {
  const errors = validateTokens({
    'primitives.json': PRIMITIVES,
    'semantic.json': { bg: { $type: 'color', primary: { $value: '#FF0000' } } },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /should reference a primitive/);
});

test('catches a reference nested inside a composite value', () => {
  const errors = validateTokens({
    'primitives.json': PRIMITIVES,
    'semantic.json': {
      shadow: {
        $type: 'shadow',
        card: {
          $value: { color: '{color.blue.404}', offsetX: '0', offsetY: '1px', blur: '2px', spread: '0' },
        },
      },
    },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /\{color\.blue\.404\}/);
});

test('accepts a composite value whose references all resolve', () => {
  assert.deepEqual(
    validateTokens({
      'primitives.json': PRIMITIVES,
      'semantic.json': {
        shadow: {
          $type: 'shadow',
          card: {
            $value: { color: '{color.blue.500}', offsetX: '0', offsetY: '1px', blur: '2px', spread: '0' },
          },
        },
      },
    }),
    [],
  );
});

test('catches an unknown $type', () => {
  const errors = validateTokens({
    'primitives.json': { color: { $type: 'colour', blue: { 500: { $value: '#3366CC' } } } },
  });
  assert.ok(errors.length >= 1);
  assert.match(errors.join('\n'), /\$type/);
});

test('catches a token with no $type anywhere up the tree', () => {
  const errors = validateTokens({
    'primitives.json': { color: { blue: { 500: { $value: '#3366CC' } } } },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /has no \$type/);
});

test('inherits $type from an ancestor group', () => {
  assert.deepEqual(
    validateTokens({ 'primitives.json': { color: { $type: 'color', blue: { 500: { $value: '#3366CC' } } } } }),
    [],
  );
});

test('catches the same token path defined in two files', () => {
  const errors = validateTokens({
    'primitives.json': PRIMITIVES,
    'extra.json': { color: { $type: 'color', blue: { 500: { $value: '#000000' } } } },
  });
  assert.ok(errors.some((e) => /already defined/.test(e)));
});

test('validates token files beyond primitives and semantic', () => {
  const errors = validateTokens({
    'primitives.json': PRIMITIVES,
    'components/button.json': { button: { $type: 'color', bg: { $value: '{color.blue.404}' } } },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /button\.bg/);
});

test('reports malformed JSON by file name', () => {
  const errors = validateTokens({ 'primitives.json': '{ "color": ' });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /primitives\.json: not valid JSON/);
});

test('reports a missing source directory instead of throwing', () => {
  const { errors } = validate({ source: join(repoRoot, 'no-such-directory') });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /not found/);
});

test('reports an empty source directory', () => {
  const project = makeProject({ 'tokens/.keep': '' });
  try {
    const { errors } = validate({ source: join(project.dir, 'tokens') });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /No \.json token files/);
  } finally {
    project.cleanup();
  }
});

test('checks values against their $type', () => {
  const errors = validateTokens({
    'primitives.json': { color: { $type: 'color', bad: { $value: 'potato' } } },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /expected a hex color/);
});

test('accepts the stable 2025.10 value forms', () => {
  assert.deepEqual(
    validateTokens({
      'primitives.json': {
        color: { $type: 'color', blue: { $value: { colorSpace: 'srgb', components: [0.2, 0.4, 0.8], hex: '#3366CC' } } },
        space: { $type: 'dimension', md: { $value: { value: 16, unit: 'px' } } },
        quick: { $type: 'duration', fast: { $value: { value: 200, unit: 'ms' } } },
        weight: { $type: 'fontWeight', bold: { $value: 700 } },
        stack: { $type: 'fontFamily', body: { $value: ['Inter', 'system-ui'] } },
        ease: { $type: 'cubicBezier', out: { $value: [0.4, 0, 0.2, 1] } },
      },
    }),
    [],
  );
});

test('rejects values that break the spec rules for their type', () => {
  const cases = [
    [{ color: { $type: 'color', x: { $value: { colorSpace: 'bogus', components: [1, 1, 1] } } } }, /unknown colorSpace/],
    [{ space: { $type: 'dimension', x: { $value: { value: 16, unit: 'em' } } } }, /unit must be/],
    [{ weight: { $type: 'fontWeight', x: { $value: 1200 } } }, /between 1 and 1000/],
    [{ ease: { $type: 'cubicBezier', x: { $value: [2, 0, 0.2, 1] } } }, /x values/],
    [{ n: { $type: 'number', x: { $value: 'three' } } }, /expected a number/],
  ];
  for (const [tokens, pattern] of cases) {
    const errors = validateTokens({ 'primitives.json': tokens });
    assert.equal(errors.length, 1, JSON.stringify(tokens));
    assert.match(errors[0], pattern);
  }
});

test('reports legacy value forms as warnings, not errors', () => {
  const project = makeProject({
    'tokens/primitives.json': JSON.stringify({
      color: { $type: 'color', blue: { $value: '#3366CC' } },
      space: { $type: 'dimension', md: { $value: '16px' } },
    }),
  });
  try {
    const { errors, warnings } = validate({ source: join(project.dir, 'tokens') });
    assert.deepEqual(errors, []);
    assert.equal(warnings.length, 2);
    assert.match(warnings.join('\n'), /2025\.10 form/);
  } finally {
    project.cleanup();
  }
});
