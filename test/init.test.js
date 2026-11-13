import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync, writeFileSync } from 'fs';
import { join } from 'path';
import { createRequire } from 'module';
import { makeProject, runCli } from './helpers.js';

const require = createRequire(import.meta.url);

const PKG_NAME = '@lacrx/design-system';

function readJson(dir, name) {
  return JSON.parse(readFileSync(join(dir, name), 'utf8'));
}

test('scaffolds a project that can build straight away', () => {
  const project = makeProject({ 'package.json': { name: 'demo', version: '1.0.0' } });
  try {
    const init = runCli(project.dir, ['init']);
    assert.equal(init.status, 0, init.stderr);

    for (const file of ['tokens/primitives.json', 'tokens/semantic.json', 'DESIGN.md', '.stylelintrc.json', 'CLAUDE.md']) {
      assert.ok(existsSync(join(project.dir, file)), `missing ${file}`);
    }

    // The scaffolded tokens must pass validation and compile unchanged.
    assert.equal(runCli(project.dir, ['validate']).status, 0);
    assert.equal(runCli(project.dir, ['build']).status, 0);
    assert.ok(existsSync(join(project.dir, 'dist', 'tokens.css')));
  } finally {
    project.cleanup();
  }
});

test('wires the dependency the scaffolded config needs to resolve', () => {
  const project = makeProject({ 'package.json': { name: 'demo', version: '1.0.0' } });
  try {
    runCli(project.dir, ['init']);
    const pkg = readJson(project.dir, 'package.json');

    // .stylelintrc.json extends the package by name, so without this entry
    // stylelint cannot resolve its config.
    assert.ok(pkg.devDependencies?.[PKG_NAME], 'dependency not added');
    assert.equal(readJson(project.dir, '.stylelintrc.json').extends, `${PKG_NAME}/lint/stylelint.config.cjs`);

    assert.equal(pkg.scripts['build:tokens'], 'design-system build');
    assert.equal(pkg.scripts['validate:tokens'], 'design-system validate');
  } finally {
    project.cleanup();
  }
});

test('wires the lint tooling the scaffolded config needs to run', () => {
  // stylelint and its plugin are optional peers of this package, so installing
  // it brings neither, and `.stylelintrc.json` alone cannot lint anything.
  const project = makeProject({ 'package.json': { name: 'demo', version: '1.0.0' } });
  try {
    runCli(project.dir, ['init']);
    const dev = readJson(project.dir, 'package.json').devDependencies;
    const peers = require('../package.json').peerDependencies;

    for (const name of Object.keys(peers)) {
      assert.ok(dev?.[name], `${name} not added to the project`);
    }
    assert.equal(readJson(project.dir, 'package.json').scripts['lint:css'], 'stylelint "**/*.css"');
  } finally {
    project.cleanup();
  }
});

test('names one command, not two', () => {
  const project = makeProject({ 'package.json': { name: 'demo', version: '1.0.0' } });
  try {
    const init = runCli(project.dir, ['init']);
    const pkg = readJson(project.dir, 'package.json');
    const mentioned = new Set(
      [...init.stdout.matchAll(/npx\s+(\S+)/g), ...Object.values(pkg.scripts).flatMap((s) => [...s.matchAll(/npx\s+(\S+)/g)])]
        .map((m) => m[1]),
    );
    assert.equal(mentioned.size, 0, `init should not suggest unpublished npx targets: ${[...mentioned]}`);
  } finally {
    project.cleanup();
  }
});

test('reports each scaffolded file exactly once', () => {
  const project = makeProject({ 'package.json': { name: 'demo', version: '1.0.0' } });
  try {
    const { stdout } = runCli(project.dir, ['init']);
    const count = (stdout.match(/Created \.stylelintrc\.json/g) || []).length;
    assert.equal(count, 1, 'stylelintrc was logged more than once');
  } finally {
    project.cleanup();
  }
});

test('is idempotent: a second run overwrites nothing', () => {
  const project = makeProject({ 'package.json': { name: 'demo', version: '1.0.0' } });
  try {
    runCli(project.dir, ['init']);
    const marker = '{"color":{"$type":"color","mine":{"$value":"#ABCDEF"}}}';
    const tokensPath = join(project.dir, 'tokens', 'primitives.json');
    writeFileSync(tokensPath, marker);

    const second = runCli(project.dir, ['init']);
    assert.equal(second.status, 0);
    assert.equal(readFileSync(tokensPath, 'utf8'), marker, 'edited tokens were overwritten');
    assert.match(second.stdout, /Skipping primitives\.json/);
    assert.match(second.stdout, /already a dependency/);
    assert.match(second.stdout, /build:tokens script already exists/);
  } finally {
    project.cleanup();
  }
});

test('appends to an existing CLAUDE.md without duplicating the section', () => {
  const project = makeProject({
    'package.json': { name: 'demo', version: '1.0.0' },
    'CLAUDE.md': '# Demo\n\nExisting notes.\n',
  });
  try {
    runCli(project.dir, ['init']);
    const first = readFileSync(join(project.dir, 'CLAUDE.md'), 'utf8');
    assert.match(first, /Existing notes/);
    assert.match(first, /## Design System/);

    runCli(project.dir, ['init']);
    const second = readFileSync(join(project.dir, 'CLAUDE.md'), 'utf8');
    assert.equal((second.match(/## Design System/g) || []).length, 1);
  } finally {
    project.cleanup();
  }
});

test('still scaffolds when there is no package.json to wire', () => {
  const project = makeProject({});
  try {
    const result = runCli(project.dir, ['init']);
    assert.equal(result.status, 0, result.stderr);
    assert.ok(existsSync(join(project.dir, 'tokens', 'primitives.json')));
    assert.match(result.stdout, /npm install --save-dev github:lacrx\/design-system/);
  } finally {
    project.cleanup();
  }
});
