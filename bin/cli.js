#!/usr/bin/env node

const command = process.argv[2];
const args = process.argv.slice(3);

function parseFlags(args) {
  const flags = {};
  const takesValue = { '--source': 'source', '--output': 'output', '--filename': 'filename' };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--watch' || arg === '-w') {
      flags.watch = true;
      continue;
    }

    if (arg === '--strict') {
      flags.strict = true;
      continue;
    }

    if (arg in takesValue) {
      const value = args[i + 1];
      if (value === undefined || value.startsWith('-')) {
        throw new Error(`${arg} requires a value`);
      }
      flags[takesValue[arg]] = value;
      i++;
      continue;
    }

    throw new Error(`Unknown option: ${arg}`);
  }

  return flags;
}

function usage() {
  console.log('Usage: design-system <command>');
  console.log('');
  console.log('Commands:');
  console.log('  init                Scaffold tokens, DESIGN.md, and lint config');
  console.log('  build               Compile tokens to CSS custom properties');
  console.log('    --source <dir>    Token source directory (default: tokens)');
  console.log('    --output <dir>    Output directory (default: dist)');
  console.log('    --filename <name> Output filename (default: tokens.css)');
  console.log('    --watch, -w       Rebuild on token file changes');
  console.log('  validate            Check token files for schema, value and reference errors');
  console.log('    --source <dir>    Token source directory (default: tokens)');
  console.log('    --strict          Also fail on pre-2025.10 value forms');
}

try {
  switch (command) {
    case 'init': {
      const { init } = await import('./init.js');
      await init();
      break;
    }
    case 'build': {
      const flags = parseFlags(args);
      const { build, watchTokens } = await import('../build/build.js');
      await build(flags);
      if (flags.watch) watchTokens(flags);
      break;
    }
    case 'validate': {
      const flags = parseFlags(args);
      const { runValidate } = await import('../schema/validate.js');
      process.exitCode = runValidate(flags);
      break;
    }
    case 'help':
    case '--help':
    case '-h':
      usage();
      break;
    default:
      if (command) console.error(`Unknown command: ${command}\n`);
      usage();
      process.exitCode = command ? 1 : 0;
      break;
  }
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
