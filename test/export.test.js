import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { renderModules } from '../build/js.js';
import { makeProject, runCli, PRIMITIVES, SEMANTIC } from './helpers.js';

const DARK = { bg: { $type: 'color', primary: { $value: '{color.blue.700}' } } };

function project() {
  return makeProject({
    'tokens/primitives.json': PRIMITIVES,
    'tokens/semantic.json': SEMANTIC,
    'tokens/themes/dark.json': DARK,
  });
}

test('emits nothing extra without --js', () => {
  const p = project();
  try {
    assert.equal(runCli(p.dir, ['build']).status, 0);
    assert.ok(existsSync(join(p.dir, 'dist', 'tokens.css')));
    assert.ok(!existsSync(join(p.dir, 'dist', 'tokens.js')), 'js should be opt-in');
    assert.ok(!existsSync(join(p.dir, 'dist', 'tokens.d.ts')));
  } finally {
    p.cleanup();
  }
});

test('emits a module and its types with --js', async () => {
  const p = project();
  try {
    assert.equal(runCli(p.dir, ['build', '--js']).status, 0);

    const module = await import(join(p.dir, 'dist', 'tokens.js'));
    // Component code references the variable, so the browser resolves the
    // theme. That is the whole reason this is a var() and not a hex string.
    assert.equal(module.tokens.bg.primary, 'var(--bg-primary)');
    assert.equal(module.tokens.color.blue['500'], 'var(--color-blue-500)');
    // Style Dictionary normalises hex to lower case on the way out.
    assert.equal(module.values.color.blue['500'].toLowerCase(), '#3366cc');

    const types = readFileSync(join(p.dir, 'dist', 'tokens.d.ts'), 'utf8');
    assert.match(types, /readonly "primary": "var\(--bg-primary\)"/);
    assert.match(types, /export declare const tokens/);
    assert.match(types, /export declare const values/);
  } finally {
    p.cleanup();
  }
});

test('names the module after the stylesheet', () => {
  const p = project();
  try {
    assert.equal(runCli(p.dir, ['build', '--js', '--filename', 'vars.css']).status, 0);
    assert.ok(existsSync(join(p.dir, 'dist', 'vars.js')));
    assert.ok(existsSync(join(p.dir, 'dist', 'vars.d.ts')));
  } finally {
    p.cleanup();
  }
});

test('a theme-only token still gets a reference, but no base value', () => {
  const p = makeProject({
    'tokens/primitives.json': PRIMITIVES,
    'tokens/semantic.json': SEMANTIC,
    'tokens/themes/dark.json': {
      bg: { $type: 'color', elevated: { $value: '{color.blue.700}' } },
    },
  });
  try {
    runCli(p.dir, ['build', '--js']);
    const source = readFileSync(join(p.dir, 'dist', 'tokens.js'), 'utf8');
    const [references, values] = source.split('export const values');
    assert.match(references, /"elevated": "var\(--bg-elevated\)"/);
    assert.ok(!values.includes('elevated'), 'a theme-only token has no base value to report');
  } finally {
    p.cleanup();
  }
});

test('--check passes on fresh output and writes nothing', () => {
  const p = project();
  try {
    runCli(p.dir, ['build', '--js']);
    const before = readFileSync(join(p.dir, 'dist', 'tokens.css'), 'utf8');

    const result = runCli(p.dir, ['build', '--js', '--check']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /up to date/);
    assert.equal(readFileSync(join(p.dir, 'dist', 'tokens.css'), 'utf8'), before);
  } finally {
    p.cleanup();
  }
});

test('--check fails when the output is stale', () => {
  const p = project();
  try {
    runCli(p.dir, ['build']);
    writeFileSync(join(p.dir, 'dist', 'tokens.css'), '/* hand-edited */\n');

    const result = runCli(p.dir, ['build', '--check']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /stale/);
    // It must not quietly repair what it was asked to check.
    assert.equal(readFileSync(join(p.dir, 'dist', 'tokens.css'), 'utf8'), '/* hand-edited */\n');
  } finally {
    p.cleanup();
  }
});

test('--check fails when the output is missing entirely', () => {
  const p = project();
  try {
    const result = runCli(p.dir, ['build', '--check']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /stale/);
    assert.ok(!existsSync(join(p.dir, 'dist', 'tokens.css')));
  } finally {
    p.cleanup();
  }
});

test('renderModules quotes numeric keys so the module parses', () => {
  const { js, dts } = renderModules([
    { path: ['color', 'blue', '500'], name: 'color-blue-500', $value: '#3366CC' },
  ]);
  assert.match(js, /"500": "var\(--color-blue-500\)"/);
  assert.match(dts, /readonly "500"/);
});
