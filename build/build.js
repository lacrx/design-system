import { existsSync, watch } from 'fs';
import { resolve, join } from 'path';
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

export function watchTokens(options = {}) {
  const source = resolve(options.source || 'tokens');
  if (!existsSync(source)) {
    console.error(`Token source directory not found: ${source}`);
    process.exit(1);
  }

  let debounce = null;
  const rebuild = () => {
    clearTimeout(debounce);
    debounce = setTimeout(async () => {
      try {
        await build(options);
      } catch (err) {
        console.error('Build failed:', err.message);
      }
    }, 150);
  };

  watch(source, { recursive: true }, (event, filename) => {
    if (filename && filename.endsWith('.json')) {
      console.log(`\n${filename} changed, rebuilding...`);
      rebuild();
    }
  });

  console.log(`Watching ${source} for changes...`);
}
