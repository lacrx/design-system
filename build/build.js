import StyleDictionary from 'style-dictionary';
import { createConfig } from './config.js';

export async function build(options = {}) {
  const config = createConfig(options);
  const sd = new StyleDictionary(config);
  await sd.buildAllPlatforms();
  const dest = config.platforms.css.files[0].destination;
  console.log('Tokens built to', config.platforms.css.buildPath + dest);
}

if (process.argv[1] && (process.argv[1].endsWith('build.js') || process.argv[1].endsWith('cli.js'))) {
  const args = process.argv.slice(2);
  const options = {};

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--source' && args[i + 1]) options.source = args[++i];
    if (args[i] === '--output' && args[i + 1]) options.output = args[++i];
  }

  build(options).catch((err) => {
    console.error(err.message || err);
    process.exit(1);
  });
}
