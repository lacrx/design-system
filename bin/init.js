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

// Stylelint and its plugin are optional peers of this package, so installing
// it brings neither. The scaffolded .stylelintrc.json is useless without them,
// so init puts them in the consuming project directly. Ranges come from our
// own peerDependencies, which stay the single source of truth.
const LINT_DEPENDENCIES = Object.fromEntries(
  Object.entries(pkg.peerDependencies || {}).map(([name, range]) => [
    name,
    range.replace(/^>=/, '^'),
  ]),
);

export async function init() {
  console.log('Initializing design system...\n');

  const tokensDir = join(cwd, 'tokens');
  if (!existsSync(tokensDir)) {
    mkdirSync(tokensDir, { recursive: true });
  }

  copyTemplate('primitives.json', join(tokensDir, 'primitives.json'));
  copyTemplate('semantic.json', join(tokensDir, 'semantic.json'));

  const themesDir = join(tokensDir, 'themes');
  if (!existsSync(themesDir)) mkdirSync(themesDir, { recursive: true });
  copyTemplate(join('themes', 'dark.json'), join(themesDir, 'dark.json'), 'themes/dark.json');
  copyTemplate('DESIGN.md', join(cwd, 'DESIGN.md'));
  copyTemplate('stylelintrc.json', join(cwd, '.stylelintrc.json'), '.stylelintrc.json');

  appendDesignRules();
  const wired = updatePackageJson();

  console.log('\nDone. Next steps:');
  let step = 1;
  if (wired) {
    console.log(`  ${step++}. Run: npm install    (pulls in ${PACKAGE_NAME})`);
  } else {
    const specs = [PACKAGE_SPEC, ...Object.keys(LINT_DEPENDENCIES)].join(' ');
    console.log(`  ${step++}. Run: npm install --save-dev ${specs}`);
  }
  console.log(`  ${step++}. Edit tokens/primitives.json with your color palette`);
  console.log(`  ${step++}. Edit tokens/semantic.json to map roles to primitives`);
  console.log(`  ${step++}. Fill in DESIGN.md with your visual direction`);
  console.log(`  ${step++}. Run: npm run build:tokens`);
  console.log(`  ${step++}. Run: npm run lint:css`);
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

  for (const [name, spec] of [[PACKAGE_NAME, PACKAGE_SPEC], ...Object.entries(LINT_DEPENDENCIES)]) {
    if (project.dependencies?.[name] || project.devDependencies?.[name]) {
      console.log(`  ${name} already a dependency`);
      continue;
    }
    project.devDependencies = project.devDependencies || {};
    project.devDependencies[name] = spec;
    console.log(`  Added ${name} to devDependencies`);
    changed = true;
  }

  if (project.devDependencies) {
    project.devDependencies = sortKeys(project.devDependencies);
  }

  project.scripts = project.scripts || {};
  for (const [name, command] of [
    ['build:tokens', 'design-system build'],
    ['validate:tokens', 'design-system validate'],
    ['lint:css', 'stylelint "**/*.css"'],
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
