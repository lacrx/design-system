import StyleDictionary from 'style-dictionary';
import { formattedVariables, fileHeader } from 'style-dictionary/utils';

export const THEMES_DIR = 'themes';

/**
 * A theme named `dark` also answers the OS preference, so it is emitted twice:
 * once inside prefers-color-scheme, where an explicit `data-theme="light"`
 * opts back out, and once for an explicit `data-theme="dark"`. Any other theme
 * is opt-in only, because the browser has no signal for it.
 */
export function blocksForTheme(name) {
  if (name === 'dark') {
    return [
      { media: '(prefers-color-scheme: dark)', selectors: [':root:not([data-theme="light"])'] },
      { selectors: [':root[data-theme="dark"]'] },
    ];
  }
  return [{ selectors: [`:root[data-theme="${name}"]`] }];
}

let registered = false;

/**
 * `css/variables` can only write one selector per file, and a theme needs the
 * same declarations under several. This emits one declaration list under any
 * number of selector blocks, optionally wrapped in a media query.
 */
export function registerFormats() {
  if (registered) return;

  StyleDictionary.registerFormat({
    name: 'css/themed-variables',
    format: async ({ dictionary, file, options }) => {
      const {
        blocks = [{ selectors: [':root'] }],
        outputReferences = true,
        header = true,
        // Set by Style Dictionary when the token files use the DTCG `$value`
        // keys. Without it every value formats as `undefined`.
        usesDtcg,
      } = options;

      const declarations = formattedVariables({
        format: 'css',
        dictionary,
        outputReferences,
        usesDtcg,
      });
      if (!declarations.trim()) return '';

      const rendered = blocks
        .map(({ selectors, media }) => {
          const rule = selectors.map((selector) => `${selector} {\n${declarations}\n}`).join('\n\n');
          if (!media) return rule;
          return `@media ${media} {\n${indent(rule)}\n}`;
        })
        .join('\n\n');

      const head = header ? await fileHeader({ file }) : '';
      return `${head}${rendered}\n`;
    },
  });

  registered = true;
}

function indent(text) {
  return text
    .split('\n')
    .map((line) => (line.trim() ? `  ${line}` : line))
    .join('\n');
}

/**
 * One Style Dictionary pass. `sources` are exact file paths rather than globs
 * so a theme pass can include the base tokens it references without emitting
 * them: `only` restricts output to the overlay's own file.
 */
export function createConfig({
  source = 'tokens',
  output = 'dist',
  filename = 'tokens.css',
  sources,
  only,
  blocks,
  header = true,
} = {}) {
  return {
    source: sources ?? [`${source}/**/*.json`],
    log: { verbosity: 'default', warnings: 'warn' },
    platforms: {
      css: {
        transformGroup: 'css',
        buildPath: output.endsWith('/') ? output : `${output}/`,
        files: [
          {
            destination: filename,
            format: 'css/themed-variables',
            ...(only ? { filter: (token) => token.filePath === only } : {}),
            options: {
              outputReferences: true,
              blocks,
              header,
            },
          },
        ],
      },
    },
  };
}
