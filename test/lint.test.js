import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'module';
import stylelint from 'stylelint';
import { repoRoot } from './helpers.js';

const require = createRequire(import.meta.url);
const config = require('../lint/stylelint.config.cjs');

async function lint(code) {
  const result = await stylelint.lint({ code, config, configBasedir: repoRoot });
  return result.results[0].warnings;
}

test('accepts CSS written entirely in tokens', async () => {
  const warnings = await lint(`
    .card {
      color: var(--text-primary);
      background: var(--bg-primary);
      background-color: var(--bg-secondary);
      border: 1px solid var(--border-default);
      border-radius: var(--radius-md);
      box-shadow: var(--shadow-sm);
      padding: var(--space-md);
      gap: var(--space-sm);
      font-size: var(--font-size-base);
      font-family: var(--font-body);
    }
  `);
  assert.deepEqual(warnings.map((w) => w.text), []);
});

test('allows values that are layout maths rather than design decisions', async () => {
  const warnings = await lint(`
    .layout {
      margin: 0 auto;
      margin-inline: auto;
      padding-block: 0;
      width: 50%;
      gap: 0;
      color: inherit;
      background: transparent;
      fill: currentColor;
    }
  `);
  assert.deepEqual(warnings.map((w) => w.text), []);
});

// Each entry is a rule written into a consuming project's CLAUDE.md by
// `design-system init`. If one stops being enforced, this test says which.
const VIOLATIONS = [
  ['hardcoded hex color', '.a { color: #ffffff; }'],
  ['hardcoded rgb color', '.a { color: rgb(0 0 0); }'],
  ['hardcoded hsl color', '.a { background-color: hsl(0 0% 100%); }'],
  ['named color', '.a { background: red; }'],
  ['hardcoded color in a border shorthand', '.a { border: 1px solid #ccc; }'],
  ['hardcoded color in a box-shadow', '.a { box-shadow: 0 1px 2px #000000; }'],
  ['hardcoded padding', '.a { padding: 12px; }'],
  ['hardcoded margin', '.a { margin-top: 7px; }'],
  ['hardcoded gap', '.a { gap: 10px; }'],
  ['hardcoded border radius', '.a { border-radius: 4px; }'],
  ['hardcoded font size', '.a { font-size: 14px; }'],
  ['hardcoded font family', '.a { font-family: Helvetica, sans-serif; }'],
  ['hardcoded fill', '.a { fill: #123456; }'],
];

for (const [label, code] of VIOLATIONS) {
  test(`rejects ${label}`, async () => {
    const warnings = await lint(code);
    assert.ok(warnings.length > 0, `${code} was accepted`);
  });
}

test('allows functions where they compose tokens rather than replace them', async () => {
  const warnings = await lint(`
    .a {
      padding: calc(var(--space-md) * 2);
      font-size: clamp(var(--font-size-sm), 2vw, var(--font-size-lg));
      color: color-mix(in srgb, var(--accent-primary) 50%, var(--bg-primary));
    }
  `);
  assert.deepEqual(warnings.map((w) => w.text), []);
});

test('names the offending property and value in the message', async () => {
  const [warning] = await lint('.a { padding: 12px; }');
  // The `{{ property }}` placeholder form is not interpolated by the plugin.
  assert.ok(!warning.text.includes('{{'), `uninterpolated placeholder: ${warning.text}`);
  assert.match(warning.text, /12px/);
  assert.match(warning.text, /padding/);
});

test('the scaffolded stylelintrc points at this config', async () => {
  const scaffold = require('../templates/stylelintrc.json');
  const pkg = require('../package.json');
  assert.equal(scaffold.extends, `${pkg.name}/lint/stylelint.config.cjs`);
  assert.ok(pkg.exports['./lint/*'], 'package does not export the lint directory');
});
