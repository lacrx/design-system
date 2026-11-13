// Shared token-file reading, used by the validator and the contrast checker.

import { readFileSync, readdirSync } from 'fs';
import { join, relative, sep, basename } from 'path';

export const THEMES_DIR = 'themes';
const REFERENCE = /\{([^{}]+)\}/g;

export function listTokenFiles(dir) {
  return readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.json'))
    .map((entry) => join(entry.parentPath ?? entry.path, entry.name))
    .sort();
}

export function isThemeFile(relPath) {
  return relPath.split(sep)[0] === THEMES_DIR;
}

/**
 * Files whose tokens must be references rather than literal values. The
 * semantic layer names roles and the theme layer re-points them; neither may
 * invent a value.
 */
export function isRoleFile(relPath) {
  const parts = relPath.split(sep);
  return (
    basename(relPath, '.json').toLowerCase().startsWith('semantic') ||
    parts.slice(0, -1).some((dir) => {
      const name = dir.toLowerCase();
      return name === 'semantic' || name === THEMES_DIR;
    })
  );
}

/**
 * Walk a parsed token file, calling visit() for every token with its dotted
 * path and the $type inherited from the nearest ancestor group.
 */
export function walkTokens(node, visit, path = [], inheritedType = undefined) {
  const groupType = node.$type ?? inheritedType;

  for (const [key, value] of Object.entries(node)) {
    if (key.startsWith('$')) continue;
    if (!value || typeof value !== 'object') continue;

    const currentPath = [...path, key];

    if ('$value' in value) {
      visit(currentPath, value, value.$type ?? groupType);
    } else {
      walkTokens(value, visit, currentPath, groupType);
    }
  }
}

/** Every {reference} inside a value, however deeply nested in a composite. */
export function collectReferences(value, out = []) {
  if (typeof value === 'string') {
    for (const match of value.matchAll(REFERENCE)) out.push(match[1]);
  } else if (Array.isArray(value)) {
    for (const item of value) collectReferences(item, out);
  } else if (value && typeof value === 'object') {
    for (const item of Object.values(value)) collectReferences(item, out);
  }
  return out;
}

export function isPureReference(value) {
  return typeof value === 'string' && /^\{[^{}]+\}$/.test(value);
}

/**
 * Read and parse every token file under `dir`.
 * Returns { files: [{relPath, json, theme}], errors }.
 */
export function readTokenFiles(dir) {
  const files = [];
  const errors = [];

  for (const file of listTokenFiles(dir)) {
    const relPath = relative(dir, file);
    try {
      files.push({
        relPath,
        file,
        json: JSON.parse(readFileSync(file, 'utf8')),
        theme: isThemeFile(relPath),
      });
    } catch (err) {
      errors.push(`${relPath}: not valid JSON (${err.message})`);
    }
  }

  return { files, errors };
}
