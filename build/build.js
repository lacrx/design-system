import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync, watch } from 'fs';
import { resolve, join, relative, sep, basename } from 'path';
import StyleDictionary from 'style-dictionary';
import { createConfig, registerFormats, blocksForTheme, THEMES_DIR } from './config.js';
import { renderModules } from './js.js';

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
  const basePass = await runPass({ ...options, sources: base, blocks: undefined, header: true });
  const sections = [basePass.output];
  const themeTokens = [];

  for (const theme of themes) {
    const pass = await runPass({
      ...options,
      sources: [...base, theme.file],
      only: theme.file,
      blocks: blocksForTheme(theme.name),
      header: false,
      quiet: true,
    });
    sections.push(pass.output);
    themeTokens.push(...pass.tokens);
  }

  const config = createConfig(options);
  const { buildPath } = config.platforms.css;
  const destination = config.platforms.css.files[0].destination;

  const artifacts = [
    { path: join(buildPath, destination), content: sections.filter(Boolean).join('\n') },
  ];

  if (options.js) {
    const { js, dts } = renderModules(basePass.tokens, themeTokens);
    const stem = destination.replace(/\.css$/, '');
    artifacts.push({ path: join(buildPath, `${stem}.js`), content: js });
    artifacts.push({ path: join(buildPath, `${stem}.d.ts`), content: dts });
  }

  if (options.check) {
    const stale = artifacts.filter(
      ({ path, content }) => !existsSync(path) || readFileSync(path, 'utf8') !== content,
    );
    if (stale.length) {
      throw new Error(
        `Built output is stale. Run the build and commit the result:\n` +
          stale.map(({ path }) => `  ${path}`).join('\n'),
      );
    }
    console.log(`Built output is up to date (${artifacts.length} file(s) checked).`);
    return;
  }

  mkdirSync(buildPath, { recursive: true });
  for (const { path, content } of artifacts) writeFileSync(path, content);

  const themeNote = themes.length ? ` (themes: ${themes.map((t) => t.name).join(', ')})` : '';
  const extra = artifacts.length > 1 ? ` plus ${artifacts.length - 1} module file(s)` : '';
  console.log('Tokens built to', buildPath + destination + themeNote + extra);
}

async function runPass(options) {
  const sd = new StyleDictionary(createConfig(options));
  const [file] = await sd.formatPlatform('css');
  const dictionary = await sd.getPlatformTokens('css');

  // A theme pass includes the base tokens it references, so narrow to the
  // overlay's own file the same way the CSS filter does.
  const tokens = options.only
    ? dictionary.allTokens.filter((token) => token.filePath === options.only)
    : dictionary.allTokens;

  return { output: file?.output ?? '', tokens };
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
