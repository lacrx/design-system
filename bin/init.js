import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, '..', 'templates');
const packageDir = join(__dirname, '..');
const cwd = process.cwd();

const pkg = JSON.parse(readFileSync(join(packageDir, 'package.json'), 'utf8'));

// The package is not on npm, so a consuming project installs it straight from
// GitHub. Without this entry the scaffolded .stylelintrc.json cannot resolve
// its `extends` target and the build scripts have no binary to run.
const PACKAGE_NAME = pkg.name;
const PACKAGE_SPEC = 'github:lacrx/design-system';

export async function init() {
  console.log('Initializing design system...\n');

  const tokensDir = join(cwd, 'tokens');
  if (!existsSync(tokensDir)) {
    mkdirSync(tokensDir, { recursive: true });
  }

  copyTemplate('primitives.json', join(tokensDir, 'primitives.json'));
  copyTemplate('semantic.json', join(tokensDir, 'semantic.json'));
  copyTemplate('DESIGN.md', join(cwd, 'DESIGN.md'));
  copyTemplate('stylelintrc.json', join(cwd, '.stylelintrc.json'), '.stylelintrc.json');

  appendDesignRules();
  const wired = updatePackageJson();

  console.log('\nDone. Next steps:');
  let step = 1;
  if (wired) {
    console.log(`  ${step++}. Run: npm install    (pulls in ${PACKAGE_NAME})`);
  } else {
    console.log(`  ${step++}. Run: npm install --save-dev ${PACKAGE_SPEC}`);
  }
  console.log(`  ${step++}. Edit tokens/primitives.json with your color palette`);
  console.log(`  ${step++}. Edit tokens/semantic.json to map roles to primitives`);
  console.log(`  ${step++}. Fill in DESIGN.md with your visual direction`);
  console.log(`  ${step++}. Run: npm run build:tokens`);
}

function copyTemplate(name, dest, label = name) {
  if (existsSync(dest)) {
    console.log(`  Skipping ${label} (already exists)`);
    return;
  }
  const src = join(templatesDir, name);
  writeFileSync(dest, readFileSync(src, 'utf8'));
  console.log(`  Created ${label}`);
}

function appendDesignRules() {
  const claudeMdPath = join(cwd, 'CLAUDE.md');
  const rules = readFileSync(join(templatesDir, 'claude-md-design.md'), 'utf8');
  const marker = '## Design System';

  if (existsSync(claudeMdPath)) {
    const existing = readFileSync(claudeMdPath, 'utf8');
    if (existing.includes(marker)) {
      console.log('  CLAUDE.md already has design system rules');
      return;
    }
    writeFileSync(claudeMdPath, existing.trimEnd() + '\n\n' + rules);
    console.log('  Appended design rules to CLAUDE.md');
  } else {
    writeFileSync(claudeMdPath, rules);
    console.log('  Created CLAUDE.md with design rules');
  }
}

/**
 * Add the dependency and the scripts that use it. Returns false when there is
 * no package.json to wire, so init() can tell the user to install by hand.
 */
function updatePackageJson() {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    console.log('  No package.json found, skipping dependency and scripts');
    return false;
  }

  const project = JSON.parse(readFileSync(pkgPath, 'utf8'));
  let changed = false;

  const installed =
    project.dependencies?.[PACKAGE_NAME] || project.devDependencies?.[PACKAGE_NAME];

  if (installed) {
    console.log(`  ${PACKAGE_NAME} already a dependency`);
  } else {
    project.devDependencies = project.devDependencies || {};
    project.devDependencies[PACKAGE_NAME] = PACKAGE_SPEC;
    project.devDependencies = sortKeys(project.devDependencies);
    console.log(`  Added ${PACKAGE_NAME} to devDependencies`);
    changed = true;
  }

  project.scripts = project.scripts || {};
  for (const [name, command] of [
    ['build:tokens', 'design-system build'],
    ['validate:tokens', 'design-system validate'],
  ]) {
    if (project.scripts[name]) {
      console.log(`  ${name} script already exists`);
      continue;
    }
    project.scripts[name] = command;
    console.log(`  Added ${name} script to package.json`);
    changed = true;
  }

  if (changed) {
    writeFileSync(pkgPath, JSON.stringify(project, null, 2) + '\n');
  }
  return true;
}

function sortKeys(obj) {
  return Object.fromEntries(Object.entries(obj).sort(([a], [b]) => a.localeCompare(b)));
}
