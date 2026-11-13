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
    return validate({ source: join(project.dir, 'tokens') });
  } finally {
    project.cleanup();
  }
}

test('accepts a well-formed token set', () => {
  assert.deepEqual(validateTokens({ 'primitives.json': PRIMITIVES, 'semantic.json': SEMANTIC }), []);
});

test('accepts the shipped examples', () => {
  for (const name of ['minimal', 'full']) {
    assert.deepEqual(validate({ source: join(repoRoot, 'examples', name) }), [], `${name} example`);
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
  const errors = validate({ source: join(repoRoot, 'no-such-directory') });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /not found/);
});

test('reports an empty source directory', () => {
  const project = makeProject({ 'tokens/.keep': '' });
  try {
    const errors = validate({ source: join(project.dir, 'tokens') });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /No \.json token files/);
  } finally {
    project.cleanup();
  }
});
