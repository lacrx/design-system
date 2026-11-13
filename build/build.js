import { existsSync, watch } from 'fs';
import { resolve } from 'path';
import StyleDictionary from 'style-dictionary';
import { createConfig } from './config.js';

// These are library entry points as well as CLI ones (see index.js), so they
// throw rather than calling process.exit. bin/cli.js turns a throw into a
// non-zero exit.
export async function build(options = {}) {
  const source = resolve(options.source || 'tokens');
  if (!existsSync(source)) {
    throw new Error(`Token source directory not found: ${source}`);
  }

  const config = createConfig(options);
  const sd = new StyleDictionary(config);
  await sd.buildAllPlatforms();
  const dest = config.platforms.css.files[0].destination;
  console.log('Tokens built to', config.platforms.css.buildPath + dest);
}

/**
 * Rebuild on token file changes. Returns the FSWatcher so a caller can stop
 * it; an unclosed watcher keeps the process alive for ever.
 */
export function watchTokens(options = {}) {
  const source = resolve(options.source || 'tokens');
  if (!existsSync(source)) {
    throw new Error(`Token source directory not found: ${source}`);
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

  // Recursive watch is only supported on Linux from Node 20, hence the engines
  // floor in package.json.
  const watcher = watch(source, { recursive: true }, (event, filename) => {
    if (filename && filename.endsWith('.json')) {
      console.log(`\n${filename} changed, rebuilding...`);
      rebuild();
    }
  });

  console.log(`Watching ${source} for changes...`);
  return watcher;
}
