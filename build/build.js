import { existsSync } from 'fs';
import { resolve } from 'path';
import StyleDictionary from 'style-dictionary';
import { createConfig } from './config.js';

export async function build(options = {}) {
  const source = resolve(options.source || 'tokens');
  if (!existsSync(source)) {
    console.error(`Token source directory not found: ${source}`);
    process.exit(1);
  }

  const config = createConfig(options);
  const sd = new StyleDictionary(config);
  await sd.buildAllPlatforms();
  const dest = config.platforms.css.files[0].destination;
  console.log('Tokens built to', config.platforms.css.buildPath + dest);
}
