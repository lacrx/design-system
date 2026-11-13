import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'fs';
import { join } from 'path';
import { validate } from '../schema/validate.js';
import { collectSources } from '../build/build.js';
import { blocksForTheme } from '../build/config.js';
import { makeProject, runCli, repoRoot, PRIMITIVES, SEMANTIC } from './helpers.js';

const DARK = { bg: { $type: 'color', primary: { $value: '{color.blue.700}' } } };

function themedProject(themes = { 'dark.json': DARK }) {
  return makeProject({
    'tokens/primitives.json': PRIMITIVES,
    'tokens/semantic.json': SEMANTIC,
    ...Object.fromEntries(
      Object.entries(themes).map(([name, body]) => [join('tokens', 'themes', name), body]),
    ),
  });
}

test('separates theme overlays from base tokens', () => {
  const project = themedProject();
  try {
    const { base, themes } = collectSources(join(project.dir, 'tokens'));
    assert.equal(base.length, 2);
    assert.deepEqual(themes.map((t) => t.name), ['dark']);
  } finally {
    project.cleanup();
  }
});

test('a theme override is not a duplicate definition', () => {
  // bg.primary exists in semantic.json and is re-pointed by the theme. Before
  // themes existed that was reported as a redefinition.
  const project = themedProject();
  try {
    assert.deepEqual(validate({ source: join(project.dir, 'tokens') }).errors, []);
  } finally {
    project.cleanup();
  }
});

test('a theme must reference primitives, not hardcode values', () => {
  const project = themedProject({ 'dark.json': { bg: { $type: 'color', primary: { $value: '#000000' } } } });
  try {
    const { errors } = validate({ source: join(project.dir, 'tokens') });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /should reference a primitive/);
  } finally {
    project.cleanup();
  }
});

test('a theme reference that resolves to nothing is an error', () => {
  const project = themedProject({ 'dark.json': { bg: { $type: 'color', primary: { $value: '{color.blue.404}' } } } });
  try {
    const { errors } = validate({ source: join(project.dir, 'tokens') });
    assert.equal(errors.length, 1);
    assert.match(errors[0], /\{color\.blue\.404\}/);
  } finally {
    project.cleanup();
  }
});

test('emits a dark theme under both the media query and the attribute', () => {
  const project = themedProject();
  try {
    assert.equal(runCli(project.dir, ['build']).status, 0);
    const css = readFileSync(join(project.dir, 'dist', 'tokens.css'), 'utf8');

    assert.match(css, /@media \(prefers-color-scheme: dark\) \{/);
    assert.match(css, /:root:not\(\[data-theme="light"\]\) \{/);
    assert.match(css, /:root\[data-theme="dark"\] \{/);

    // Only the overridden token belongs in a theme block, and it still points
    // at the primitive rather than copying its value.
    const themeBlock = css.slice(css.indexOf('@media'));
    assert.match(themeBlock, /--bg-primary: var\(--color-blue-700\);/);
    assert.ok(!themeBlock.includes('--text-accent'), 'theme block leaked a token it does not override');
    assert.ok(!themeBlock.includes('--color-blue-500'), 'theme block leaked a primitive');
  } finally {
    project.cleanup();
  }
});

test('a non-dark theme is opt-in only', () => {
  const project = themedProject({ 'sepia.json': DARK });
  try {
    assert.equal(runCli(project.dir, ['build']).status, 0);
    const css = readFileSync(join(project.dir, 'dist', 'tokens.css'), 'utf8');
    assert.match(css, /:root\[data-theme="sepia"\] \{/);
    assert.ok(!css.includes('prefers-color-scheme'), 'only dark should answer the OS preference');
  } finally {
    project.cleanup();
  }
});

test('blocksForTheme describes dark differently from the rest', () => {
  const dark = blocksForTheme('dark');
  assert.equal(dark.length, 2);
  assert.equal(dark[0].media, '(prefers-color-scheme: dark)');
  assert.deepEqual(blocksForTheme('sepia'), [{ selectors: [':root[data-theme="sepia"]'] }]);
});

test('output is unchanged when a project has no themes', () => {
  const project = makeProject({ 'tokens/primitives.json': PRIMITIVES, 'tokens/semantic.json': SEMANTIC });
  try {
    assert.equal(runCli(project.dir, ['build']).status, 0);
    const css = readFileSync(join(project.dir, 'dist', 'tokens.css'), 'utf8');
    assert.match(css, /^\/\*\*/);
    assert.match(css, /:root \{/);
    assert.ok(!css.includes('data-theme'), 'no theme files should mean no theme blocks');
  } finally {
    project.cleanup();
  }
});

test('the shipped full example carries a working theme', () => {
  const { errors, warnings } = validate({ source: join(repoRoot, 'examples', 'full') });
  assert.deepEqual(errors, []);
  assert.deepEqual(warnings, []);
});

test('the scaffold ships a dark theme that validates and builds', () => {
  const project = makeProject({ 'package.json': { name: 'demo', version: '1.0.0' } });
  try {
    runCli(project.dir, ['init']);
    assert.equal(runCli(project.dir, ['validate']).status, 0);
    assert.equal(runCli(project.dir, ['build']).status, 0);

    const css = readFileSync(join(project.dir, 'dist', 'tokens.css'), 'utf8');
    assert.match(css, /prefers-color-scheme: dark/);
  } finally {
    project.cleanup();
  }
});
