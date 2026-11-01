import { existsSync, mkdirSync, writeFileSync, readFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const templatesDir = join(__dirname, '..', 'templates');
const cwd = process.cwd();

export async function init() {
  console.log('Initializing design system...\n');

  const tokensDir = join(cwd, 'tokens');
  if (!existsSync(tokensDir)) {
    mkdirSync(tokensDir, { recursive: true });
  }

  copyTemplate('primitives.json', join(tokensDir, 'primitives.json'));
  copyTemplate('semantic.json', join(tokensDir, 'semantic.json'));
  copyTemplate('DESIGN.md', join(cwd, 'DESIGN.md'));

  const stylelintPath = join(cwd, '.stylelintrc.json');
  if (!existsSync(stylelintPath)) {
    copyTemplate('stylelintrc.json', stylelintPath);
    console.log('  Created .stylelintrc.json');
  } else {
    console.log('  Skipping .stylelintrc.json (already exists)');
  }

  appendDesignRules();
  addBuildScript();

  console.log('\nDone. Next steps:');
  console.log('  1. Edit tokens/primitives.json with your color palette');
  console.log('  2. Edit tokens/semantic.json to map roles to primitives');
  console.log('  3. Fill in DESIGN.md with your visual direction');
  console.log('  4. Run: npx @lacrx/design-system build');
}

function copyTemplate(name, dest) {
  if (existsSync(dest)) {
    console.log(`  Skipping ${name} (already exists)`);
    return;
  }
  const src = join(templatesDir, name);
  writeFileSync(dest, readFileSync(src, 'utf8'));
  console.log(`  Created ${name}`);
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

function addBuildScript() {
  const pkgPath = join(cwd, 'package.json');
  if (!existsSync(pkgPath)) {
    console.log('  No package.json found, skipping build script');
    return;
  }

  const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'));
  if (!pkg.scripts) pkg.scripts = {};

  if (pkg.scripts['build:tokens']) {
    console.log('  build:tokens script already exists');
    return;
  }

  pkg.scripts['build:tokens'] = 'npx design-system build';
  writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
  console.log('  Added build:tokens script to package.json');
}
