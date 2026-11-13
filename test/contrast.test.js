import { test } from 'node:test';
import assert from 'node:assert/strict';
import { join } from 'path';
import { checkContrast, contrastRatio, toSrgb, EXTENSION } from '../schema/contrast.js';
import { makeProject, runCli, repoRoot } from './helpers.js';

const srgb = (hex) => toSrgb(hex).components;

function pairProject(tokens) {
  return makeProject(
    Object.fromEntries(Object.entries(tokens).map(([name, body]) => [join('tokens', name), body])),
  );
}

function check(tokens, options = {}) {
  const project = pairProject(tokens);
  try {
    return checkContrast({ source: join(project.dir, 'tokens'), ...options });
  } finally {
    project.cleanup();
  }
}

const PALETTE = {
  color: {
    $type: 'color',
    white: { $value: '#FFFFFF' },
    black: { $value: '#000000' },
    grey: { $value: '#767676' },
    lightGrey: { $value: '#777777' },
  },
};

const declare = (on, extra = {}) => ({ [EXTENSION]: { on, ...extra } });

test('matches the reference ratios', () => {
  // The canonical checks: pure contrast, and the grey that sits either side of
  // the 4.5 line.
  assert.equal(contrastRatio(srgb('#FFFFFF'), srgb('#000000')).toFixed(2), '21.00');
  assert.equal(contrastRatio(srgb('#767676'), srgb('#FFFFFF')).toFixed(2), '4.54');
  assert.equal(contrastRatio(srgb('#777777'), srgb('#FFFFFF')).toFixed(2), '4.48');
});

test('reads both the hex and the 2025.10 object colour forms', () => {
  assert.deepEqual(toSrgb('#FFFFFF').components, [1, 1, 1]);
  assert.deepEqual(toSrgb({ colorSpace: 'srgb', components: [1, 1, 1] }).components, [1, 1, 1]);
  assert.deepEqual(toSrgb({ colorSpace: 'oklch', components: [1, 0, 0], hex: '#FFFFFF' }).components, [1, 1, 1]);
  assert.match(toSrgb({ colorSpace: 'oklch', components: [1, 0, 0] }).unsupported, /oklch/);
});

test('passes a pair that clears AA', () => {
  const { failures, checks, errors } = check({
    'primitives.json': PALETTE,
    'semantic.json': {
      bg: { $type: 'color', primary: { $value: '{color.white}' } },
      text: { $type: 'color', muted: { $value: '{color.grey}', $extensions: declare(['bg.primary']) } },
    },
  });
  assert.deepEqual(errors, []);
  assert.deepEqual(failures, []);
  assert.equal(checks.length, 1);
  assert.equal(checks[0].ratio.toFixed(2), '4.54');
});

test('fails a pair that misses AA by a hair', () => {
  const { failures } = check({
    'primitives.json': PALETTE,
    'semantic.json': {
      bg: { $type: 'color', primary: { $value: '{color.white}' } },
      text: { $type: 'color', muted: { $value: '{color.lightGrey}', $extensions: declare(['bg.primary']) } },
    },
  });
  assert.equal(failures.length, 1);
  assert.equal(failures[0].ratio.toFixed(2), '4.48');
  assert.equal(failures[0].threshold, 4.5);
});

test('AAA and large text move the threshold', () => {
  const tokens = (extra) => ({
    'primitives.json': PALETTE,
    'semantic.json': {
      bg: { $type: 'color', primary: { $value: '{color.white}' } },
      text: { $type: 'color', muted: { $value: '{color.grey}', $extensions: declare(['bg.primary'], extra) } },
    },
  });
  assert.equal(check(tokens({ level: 'AAA' })).failures.length, 1, '4.54 should miss AAA normal');
  assert.equal(check(tokens({ level: 'AAA', size: 'large' })).failures.length, 0, '4.54 clears AAA large');
  assert.equal(check(tokens({}), { level: 'AAA' }).failures.length, 1, '--level should override');
});

test('checks every theme, not just the base', () => {
  // The base passes and the theme does not. A checker that only looked at the
  // base would call this fine, which is the bug worth catching.
  const { checks, failures } = check({
    'primitives.json': PALETTE,
    'semantic.json': {
      bg: { $type: 'color', primary: { $value: '{color.white}' } },
      text: { $type: 'color', muted: { $value: '{color.grey}', $extensions: declare(['bg.primary']) } },
    },
    'themes/dark.json': {
      bg: { $type: 'color', primary: { $value: '{color.lightGrey}' } },
    },
  });
  assert.equal(checks.length, 2, 'base and dark');
  assert.equal(failures.length, 1);
  assert.match(failures[0].label, /^dark:/);
});

test('skips a translucent colour rather than reporting a wrong ratio', () => {
  const { skipped, checks } = check({
    'primitives.json': {
      color: {
        $type: 'color',
        white: { $value: '#FFFFFF' },
        faded: { $value: { colorSpace: 'srgb', components: [0, 0, 0], alpha: 0.5 } },
      },
    },
    'semantic.json': {
      bg: { $type: 'color', primary: { $value: '{color.white}' } },
      text: { $type: 'color', muted: { $value: '{color.faded}', $extensions: declare(['bg.primary']) } },
    },
  });
  assert.equal(checks.length, 0);
  assert.equal(skipped.length, 1);
  assert.match(skipped[0], /translucent/);
});

test('reports a pair that names a token which does not exist', () => {
  const { errors } = check({
    'primitives.json': PALETTE,
    'semantic.json': {
      bg: { $type: 'color', primary: { $value: '{color.white}' } },
      text: { $type: 'color', muted: { $value: '{color.grey}', $extensions: declare(['bg.nope']) } },
    },
  });
  assert.equal(errors.length, 1);
  assert.match(errors[0], /bg\.nope is not defined/);
});

test('says so when no pairs are declared', () => {
  const project = pairProject({ 'primitives.json': PALETTE });
  try {
    const result = runCli(project.dir, ['contrast']);
    assert.equal(result.status, 0);
    assert.match(result.stdout, /No contrast pairs declared/);
  } finally {
    project.cleanup();
  }
});

test('the shipped example and the scaffold both pass AA', () => {
  const example = checkContrast({ source: join(repoRoot, 'examples', 'full') });
  assert.deepEqual(example.errors, []);
  assert.deepEqual(example.failures, []);
  assert.ok(example.checks.length >= 12, 'the example should declare real pairs');

  const project = makeProject({ 'package.json': { name: 'demo', version: '1.0.0' } });
  try {
    runCli(project.dir, ['init']);
    const result = runCli(project.dir, ['contrast']);
    assert.equal(result.status, 0, result.stdout + result.stderr);
    assert.match(result.stdout, /pair\(s\) pass/);
  } finally {
    project.cleanup();
  }
});
