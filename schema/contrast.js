// WCAG 2.1 contrast checking for declared token pairs.
//
// A semantic colour token declares what it is meant to sit on:
//
//   "text": { "$type": "color", "primary": {
//     "$value": "{color.neutral.900}",
//     "$extensions": { "com.lacrx.contrast": { "on": ["bg.primary"], "level": "AA" } }
//   }}
//
// Every pair is checked in the base theme and again in each theme overlay,
// because a theme is exactly where a palette edit quietly breaks contrast.

import { resolve, relative } from 'path';
import { basename } from 'path';
import { readTokenFiles, walkTokens, isPureReference } from './tokens.js';

export const EXTENSION = 'com.lacrx.contrast';

const THRESHOLDS = {
  AA: { normal: 4.5, large: 3 },
  AAA: { normal: 7, large: 4.5 },
};

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

function hexToComponents(hex) {
  let value = hex.slice(1);
  if (value.length === 3 || value.length === 4) {
    value = value.split('').map((c) => c + c).join('');
  }
  const components = [0, 2, 4].map((i) => parseInt(value.slice(i, i + 2), 16) / 255);
  const alpha = value.length === 8 ? parseInt(value.slice(6, 8), 16) / 255 : 1;
  return { components, alpha };
}

/**
 * Reduce a colour token value to sRGB components.
 * Returns { components, alpha } or { unsupported: 'reason' }.
 */
export function toSrgb(value) {
  if (typeof value === 'string') {
    if (!HEX.test(value)) return { unsupported: `cannot read the colour ${JSON.stringify(value)}` };
    return hexToComponents(value);
  }

  if (value && typeof value === 'object') {
    const alpha = value.alpha ?? 1;
    if (value.colorSpace === 'srgb' && Array.isArray(value.components)) {
      if (value.components.some((c) => typeof c !== 'number')) {
        return { unsupported: 'has a "none" component' };
      }
      return { components: value.components, alpha };
    }
    if (typeof value.hex === 'string' && HEX.test(value.hex)) {
      const fromHex = hexToComponents(value.hex);
      return { components: fromHex.components, alpha };
    }
    return { unsupported: `is in ${value.colorSpace}, which has no hex fallback to measure` };
  }

  return { unsupported: 'is not a colour' };
}

const linearize = (channel) =>
  channel <= 0.04045 ? channel / 12.92 : ((channel + 0.055) / 1.055) ** 2.4;

export function relativeLuminance([r, g, b]) {
  return 0.2126 * linearize(r) + 0.7152 * linearize(g) + 0.0722 * linearize(b);
}

export function contrastRatio(foreground, background) {
  const a = relativeLuminance(foreground);
  const b = relativeLuminance(background);
  const [light, dark] = a > b ? [a, b] : [b, a];
  return (light + 0.05) / (dark + 0.05);
}

/** Follow {references} until a concrete value, within one theme's view. */
function resolveValue(path, view, seen = new Set()) {
  const token = view.get(path);
  if (!token) return { missing: true };
  if (seen.has(path)) return { unsupported: 'is part of a reference cycle' };
  seen.add(path);

  const value = token.$value;
  if (isPureReference(value)) {
    return resolveValue(value.slice(1, -1), view, seen);
  }
  return { value };
}

/**
 * Check every declared pair.
 * Returns { failures, checks, skipped, errors }.
 */
export function checkContrast({ source = 'tokens', level: forcedLevel } = {}) {
  const dir = resolve(source);
  const { files, errors } = readTokenFiles(dir);

  if (errors.length) return { failures: [], checks: [], skipped: [], errors };
  if (files.length === 0) return { failures: [], checks: [], skipped: [], errors: [`No .json token files found in ${dir}`] };

  // The base view, then one view per theme with its overrides applied on top.
  const base = new Map();
  const pairs = [];

  for (const { json, theme } of files) {
    if (theme) continue;
    walkTokens(json, (path, token, type) => {
      const dotted = path.join('.');
      base.set(dotted, token);
      const declared = token.$extensions?.[EXTENSION];
      if (declared && type === 'color') {
        pairs.push({ foreground: dotted, ...declared });
      }
    });
  }

  const views = [{ theme: 'base', view: base }];
  for (const { relPath, json, theme } of files) {
    if (!theme) continue;
    const view = new Map(base);
    walkTokens(json, (path, token) => view.set(path.join('.'), token));
    views.push({ theme: basename(relPath, '.json'), view });
  }

  const checks = [];
  const failures = [];
  const skipped = [];

  for (const { theme, view } of views) {
    for (const pair of pairs) {
      const level = forcedLevel || pair.level || 'AA';
      const size = pair.size || 'normal';
      const threshold = THRESHOLDS[level]?.[size];

      if (!threshold) {
        errors.push(`${pair.foreground}: unknown contrast level ${JSON.stringify(level)}`);
        continue;
      }

      const foreground = resolveValue(pair.foreground, view);
      const backgrounds = Array.isArray(pair.on) ? pair.on : [pair.on];

      for (const background of backgrounds) {
        const label = `${theme}: ${pair.foreground} on ${background}`;

        if (foreground.missing) {
          errors.push(`${label}: ${pair.foreground} is not defined`);
          continue;
        }

        const other = resolveValue(background, view);
        if (other.missing) {
          errors.push(`${label}: ${background} is not defined`);
          continue;
        }

        const fg = foreground.unsupported ? foreground : toSrgb(foreground.value);
        const bg = other.unsupported ? other : toSrgb(other.value);

        if (fg.unsupported || bg.unsupported) {
          skipped.push(`${label}: ${fg.unsupported ?? bg.unsupported}`);
          continue;
        }
        if (fg.alpha < 1 || bg.alpha < 1) {
          skipped.push(`${label}: a translucent colour's real contrast depends on what is behind it`);
          continue;
        }

        const ratio = contrastRatio(fg.components, bg.components);
        const check = { label, ratio, threshold, level, size, passed: ratio >= threshold };
        checks.push(check);
        if (!check.passed) failures.push(check);
      }
    }
  }

  return { failures, checks, skipped, errors };
}

/** CLI wrapper: prints the report and returns the process exit code. */
export function runContrast(options = {}) {
  const { failures, checks, skipped, errors } = checkContrast(options);

  for (const error of errors) console.error(error);

  for (const check of checks) {
    const mark = check.passed ? 'ok  ' : 'FAIL';
    console.log(
      `${mark} ${check.label}: ${check.ratio.toFixed(2)}:1 (${check.level} ${check.size} needs ${check.threshold}:1)`,
    );
  }

  for (const note of skipped) console.log(`skip ${note}`);

  if (checks.length === 0 && errors.length === 0) {
    console.log(
      `No contrast pairs declared. Add "$extensions": { "${EXTENSION}": { "on": ["bg.primary"] } } to a semantic colour token.`,
    );
    return 0;
  }

  if (failures.length || errors.length) {
    console.error(`\n${failures.length + errors.length} contrast problem(s) found.`);
    return 1;
  }

  console.log(`\n${checks.length} pair(s) pass.`);
  return 0;
}
