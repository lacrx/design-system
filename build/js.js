// Emits a JS module and its types alongside the stylesheet, so component code
// can reference a token instead of retyping its CSS variable name.

const HEADER = `/**
 * Do not edit directly, this file was auto-generated.
 */
`;

const TOKENS_DOC = `/**
 * CSS custom property references, e.g. \`tokens.bg.primary\` is
 * \`"var(--bg-primary)"\`.
 *
 * Theme-aware: the browser resolves the variable, so the same reference picks
 * up the dark theme without the component knowing a theme exists. Use this in
 * component code.
 */`;

const VALUES_DOC = `/**
 * Resolved values from the BASE theme only, e.g. \`values.bg.primary\` is
 * \`"#ffffff"\`.
 *
 * Not theme-aware. A dark theme changes what \`var(--bg-primary)\` resolves to
 * and cannot change this string. Use it only where a CSS variable cannot go,
 * such as a canvas fill or a \`<meta name="theme-color">\`, and read the theme
 * yourself if it matters.
 */`;

/** Build a nested plain object from tokens keyed by their path. */
function nest(entries) {
  const root = {};
  for (const [path, value] of entries) {
    let node = root;
    for (const segment of path.slice(0, -1)) {
      node[segment] = node[segment] ?? {};
      node = node[segment];
    }
    node[path[path.length - 1]] = value;
  }
  return root;
}

function renderObject(node, indent = '  ') {
  const lines = Object.entries(node).map(([key, value]) => {
    const name = JSON.stringify(key);
    if (value && typeof value === 'object') {
      return `${indent}${name}: ${renderObject(value, indent + '  ')},`;
    }
    return `${indent}${name}: ${JSON.stringify(value)},`;
  });
  return `{\n${lines.join('\n')}\n${indent.slice(2)}}`;
}

function renderType(node, indent = '  ') {
  const lines = Object.entries(node).map(([key, value]) => {
    const name = JSON.stringify(key);
    if (value && typeof value === 'object') {
      return `${indent}readonly ${name}: ${renderType(value, indent + '  ')};`;
    }
    return `${indent}readonly ${name}: ${JSON.stringify(String(value))};`;
  });
  return `{\n${lines.join('\n')}\n${indent.slice(2)}}`;
}

/**
 * @param baseTokens  transformed tokens from the base pass
 * @param themeTokens transformed tokens from every theme overlay; a token that
 *                    exists only in a theme still gets a reference, but has no
 *                    base value to report
 */
export function renderModules(baseTokens, themeTokens = []) {
  const referenceEntries = new Map();
  const valueEntries = [];

  for (const token of baseTokens) {
    referenceEntries.set(token.path.join('.'), [token.path, `var(--${token.name})`]);
    valueEntries.push([token.path, token.$value ?? token.value]);
  }

  for (const token of themeTokens) {
    const key = token.path.join('.');
    if (!referenceEntries.has(key)) {
      referenceEntries.set(key, [token.path, `var(--${token.name})`]);
    }
  }

  const references = nest([...referenceEntries.values()]);
  const values = nest(valueEntries);

  const js = [
    HEADER,
    TOKENS_DOC,
    `export const tokens = ${renderObject(references)};`,
    '',
    VALUES_DOC,
    `export const values = ${renderObject(values)};`,
    '',
  ].join('\n');

  const dts = [
    HEADER,
    TOKENS_DOC,
    `export declare const tokens: ${renderType(references)};`,
    '',
    VALUES_DOC,
    `export declare const values: ${renderType(values)};`,
    '',
  ].join('\n');

  return { js, dts };
}
