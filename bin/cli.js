#!/usr/bin/env node

const command = process.argv[2];
const args = process.argv.slice(3);

switch (command) {
  case 'init': {
    const { init } = await import('./init.js');
    await init();
    break;
  }
  case 'build': {
    const options = {};
    for (let i = 0; i < args.length; i++) {
      if (args[i] === '--source' && args[i + 1]) options.source = args[++i];
      if (args[i] === '--output' && args[i + 1]) options.output = args[++i];
    }
    const { build } = await import('../build/build.js');
    await build(options);
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
    console.log('  build               Compile tokens/ to dist/tokens.css');
    console.log('    --source <dir>    Token source directory (default: tokens)');
    console.log('    --output <dir>    Output directory (default: dist)');
    console.log('  validate            Check token files for schema errors');
    break;
}
