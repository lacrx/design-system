#!/usr/bin/env node

const command = process.argv[2];
const args = process.argv.slice(3);

function parseFlags(args) {
  const flags = {};
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) flags.source = args[++i];
    if (args[i] === '--output' && args[i + 1]) flags.output = args[++i];
    if (args[i] === '--filename' && args[i + 1]) flags.filename = args[++i];
    if (args[i] === '--watch' || args[i] === '-w') flags.watch = true;
  }
  return flags;
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
      await import('../schema/validate.js');
      break;
    }
    default:
      console.log('Usage: design-system <command>');
      console.log('');
      console.log('Commands:');
      console.log('  init                Scaffold tokens, DESIGN.md, and lint config');
      console.log('  build               Compile tokens to CSS custom properties');
      console.log('    --source <dir>    Token source directory (default: tokens)');
      console.log('    --output <dir>    Output directory (default: dist)');
      console.log('    --filename <name> Output filename (default: tokens.css)');
      console.log('    --watch, -w       Rebuild on token file changes');
      console.log('  validate            Check token files for schema errors');
      break;
  }
} catch (err) {
  console.error(err.message || err);
  process.exit(1);
}
