import { existsSync, mkdirSync, readdirSync, writeFileSync, watch } from 'fs';
import { resolve, join, relative, sep, basename } from 'path';
import StyleDictionary from 'style-dictionary';
import { createConfig, registerFormats, blocksForTheme, THEMES_DIR } from './config.js';

/** Every .json under `dir`, split into base tokens and theme overlays. */
export function collectSources(dir) {
  const files = readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
    .sort();

  const base = [];
  const themes = [];

  for (const file of files) {
    if (relative(dir, file).split(sep)[0] === THEMES_DIR) {
      themes.push({ name: basename(file, '.json'), file });
    } else {
      base.push(file);
    }
  }

  return { base, themes };
}

// These are library entry points as well as CLI ones (see index.js), so they
// throw rather than calling process.exit. bin/cli.js turns a throw into a
// non-zero exit.
export async function build(options = {}) {
  const source = resolve(options.source || 'tokens');
  if (!existsSync(source)) {
    throw new Error(`Token source directory not found: ${source}`);
  }

  registerFormats();

  const { base, themes } = collectSources(source);
  if (base.length === 0) {
    throw new Error(`No base token files found in ${source}`);
  }

  // The base pass carries the header; each theme appends a block to the same
  // stylesheet, so a consumer still links one file.
  const sections = [await format({ ...options, sources: base, blocks: undefined, header: true })];

  for (const theme of themes) {
    sections.push(
      await format({
        ...options,
        sources: [...base, theme.file],
        only: theme.file,
        blocks: blocksForTheme(theme.name),
        header: false,
      }),
    );
  }

  const config = createConfig(options);
  const { buildPath } = config.platforms.css;
  const destination = config.platforms.css.files[0].destination;

  mkdirSync(buildPath, { recursive: true });
  writeFileSync(join(buildPath, destination), sections.filter(Boolean).join('\n'));

  const themeNote = themes.length ? ` (themes: ${themes.map((t) => t.name).join(', ')})` : '';
  console.log('Tokens built to', buildPath + destination + themeNote);
}

async function format(options) {
  const sd = new StyleDictionary(createConfig(options));
  const [file] = await sd.formatPlatform('css');
  return file?.output ?? '';
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
