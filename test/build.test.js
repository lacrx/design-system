import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'fs';
import { join } from 'path';
import { build, watchTokens } from '../build/build.js';
import { createConfig } from '../build/config.js';
import { makeProject, runCli, PRIMITIVES, SEMANTIC } from './helpers.js';

test('compiles tokens to CSS custom properties', () => {
  const project = makeProject({
    'tokens/primitives.json': PRIMITIVES,
    'tokens/semantic.json': SEMANTIC,
  });
  try {
    const result = runCli(project.dir, ['build']);
    assert.equal(result.status, 0, result.stderr);

    const css = readFileSync(join(project.dir, 'dist', 'tokens.css'), 'utf8');
    assert.match(css, /--color-blue-500: #3366CC;/i);
    // outputReferences keeps the semantic layer pointing at the primitive.
    assert.match(css, /--bg-primary: var\(--color-blue-500\);/);
  } finally {
    project.cleanup();
  }
});

test('honours --source, --output and --filename', () => {
  const project = makeProject({
    'design/primitives.json': PRIMITIVES,
    'design/semantic.json': SEMANTIC,
  });
  try {
    const result = runCli(project.dir, [
      'build', '--source', 'design', '--output', 'public/css', '--filename', 'vars.css',
    ]);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(project.dir, 'public', 'css', 'vars.css')));
  } finally {
    project.cleanup();
  }
});

test('fails with a non-zero exit when a reference cannot be resolved', () => {
  const project = makeProject({
    'tokens/primitives.json': PRIMITIVES,
    'tokens/semantic.json': { bg: { $type: 'color', primary: { $value: '{color.blue.999}' } } },
  });
  try {
    const result = runCli(project.dir, ['build']);
    assert.equal(result.status, 1);
    assert.ok(!existsSync(join(project.dir, 'dist', 'tokens.css')), 'must not write a broken stylesheet');
  } finally {
    project.cleanup();
  }
});

test('build() throws rather than killing the host process', async () => {
  // index.js exports build as a library API, so process.exit is not available
  // to it: a consumer that catches the error must stay alive.
  await assert.rejects(() => build({ source: '/definitely/not/a/real/path' }), /not found/);
});

test('watchTokens() throws on a missing source and returns a closable watcher', () => {
  assert.throws(() => watchTokens({ source: '/definitely/not/a/real/path' }), /not found/);

  const project = makeProject({ 'tokens/primitives.json': PRIMITIVES });
  try {
    const watcher = watchTokens({ source: join(project.dir, 'tokens') });
    assert.equal(typeof watcher.close, 'function');
    watcher.close();
  } finally {
    project.cleanup();
  }
});

test('createConfig normalises the output path', () => {
  assert.equal(createConfig({ output: 'dist' }).platforms.css.buildPath, 'dist/');
  assert.equal(createConfig({ output: 'dist/' }).platforms.css.buildPath, 'dist/');
  assert.equal(createConfig().platforms.css.files[0].options.outputReferences, true);
});

test('rejects an unknown option instead of ignoring it', () => {
  const project = makeProject({ 'tokens/primitives.json': PRIMITIVES });
  try {
    const result = runCli(project.dir, ['build', '--destination', 'dist']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /Unknown option: --destination/);
  } finally {
    project.cleanup();
  }
});

test('rejects a flag whose value is missing', () => {
  const project = makeProject({ 'tokens/primitives.json': PRIMITIVES });
  try {
    const result = runCli(project.dir, ['build', '--source']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /--source requires a value/);
  } finally {
    project.cleanup();
  }
});

test('validate reports schema errors through the CLI exit code', () => {
  const project = makeProject({
    'tokens/primitives.json': { color: { $type: 'color', blue: { 500: { $value: '#3366CC' } } } },
    'tokens/semantic.json': { bg: { $type: 'color', primary: { $value: '#FF0000' } } },
  });
  try {
    const result = runCli(project.dir, ['validate']);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /should reference a primitive/);
  } finally {
    project.cleanup();
  }
});
