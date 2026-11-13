// Value checks per $type, from the DTCG 2025.10 stable spec.
//
// These live outside tokens.schema.json because a token's type can be
// inherited from an ancestor group, and JSON Schema cannot see up the tree to
// know which rule applies.

const COLOR_SPACES = new Set([
  'srgb', 'srgb-linear', 'hsl', 'hwb', 'lab', 'lch', 'oklab', 'oklch',
  'display-p3', 'a98-rgb', 'prophoto-rgb', 'rec2020', 'xyz-d65', 'xyz-d50',
]);

const FONT_WEIGHTS = new Set([
  'thin', 'hairline', 'extra-light', 'ultra-light', 'light', 'normal',
  'regular', 'book', 'medium', 'semi-bold', 'demi-bold', 'bold', 'extra-bold',
  'ultra-bold', 'black', 'heavy', 'extra-black', 'ultra-black',
]);

const STROKE_STYLES = new Set([
  'solid', 'dashed', 'dotted', 'double', 'groove', 'ridge', 'outset', 'inset',
]);

const HEX = /^#(?:[0-9a-fA-F]{3,4}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;
const HEX6 = /^#[0-9a-fA-F]{6}$/;
const DIMENSION_STRING = /^-?\d+(\.\d+)?(px|rem)$/;
const DURATION_STRING = /^\d+(\.\d+)?(ms|s)$/;

const isNumber = (v) => typeof v === 'number' && Number.isFinite(v);
const isObject = (v) => v !== null && typeof v === 'object' && !Array.isArray(v);

/**
 * The string forms predate the stable spec. They still build, so they are
 * reported as legacy rather than rejected; `strict` turns them into errors.
 */
const LEGACY = (form, instead) => ({ legacy: `${form}; the 2025.10 form is ${instead}` });

const CHECKS = {
  color(value) {
    if (typeof value === 'string') {
      if (!HEX.test(value)) return { error: `expected a hex color, got ${JSON.stringify(value)}` };
      return LEGACY('a hex string', '{ "colorSpace": "srgb", "components": [r, g, b] }');
    }
    if (!isObject(value)) return { error: 'expected an object with colorSpace and components' };
    if (!COLOR_SPACES.has(value.colorSpace)) {
      return { error: `unknown colorSpace ${JSON.stringify(value.colorSpace)}` };
    }
    if (!Array.isArray(value.components) || value.components.length !== 3) {
      return { error: 'components must be an array of 3 values' };
    }
    for (const component of value.components) {
      if (!isNumber(component) && component !== 'none') {
        return { error: `component ${JSON.stringify(component)} must be a number or "none"` };
      }
    }
    if (value.alpha !== undefined && (!isNumber(value.alpha) || value.alpha < 0 || value.alpha > 1)) {
      return { error: 'alpha must be a number between 0 and 1' };
    }
    if (value.hex !== undefined && !HEX6.test(value.hex)) {
      return { error: 'hex fallback must be 6-digit CSS hex notation' };
    }
    return {};
  },

  dimension(value) {
    if (typeof value === 'string') {
      if (value === '0') return LEGACY('a bare 0', '{ "value": 0, "unit": "px" }');
      if (!DIMENSION_STRING.test(value)) {
        return { error: `expected a px or rem value, got ${JSON.stringify(value)}` };
      }
      return LEGACY('a string', '{ "value": 16, "unit": "px" }');
    }
    if (!isObject(value)) return { error: 'expected an object with value and unit' };
    if (!isNumber(value.value)) return { error: 'value must be a number' };
    if (value.unit !== 'px' && value.unit !== 'rem') {
      return { error: `unit must be "px" or "rem", got ${JSON.stringify(value.unit)}` };
    }
    return {};
  },

  duration(value) {
    if (typeof value === 'string') {
      if (!DURATION_STRING.test(value)) {
        return { error: `expected an ms or s value, got ${JSON.stringify(value)}` };
      }
      return LEGACY('a string', '{ "value": 200, "unit": "ms" }');
    }
    if (!isObject(value)) return { error: 'expected an object with value and unit' };
    if (!isNumber(value.value)) return { error: 'value must be a number' };
    if (value.unit !== 'ms' && value.unit !== 's') {
      return { error: `unit must be "ms" or "s", got ${JSON.stringify(value.unit)}` };
    }
    return {};
  },

  fontFamily(value) {
    if (typeof value === 'string') return {};
    if (Array.isArray(value) && value.length > 0 && value.every((v) => typeof v === 'string')) return {};
    return { error: 'expected a font name or an array of font names' };
  },

  fontWeight(value) {
    if (isNumber(value)) {
      if (value < 1 || value > 1000) return { error: 'numeric weight must be between 1 and 1000' };
      return {};
    }
    if (typeof value === 'string' && FONT_WEIGHTS.has(value)) return {};
    return { error: `expected 1-1000 or a predefined weight, got ${JSON.stringify(value)}` };
  },

  number(value) {
    return isNumber(value) ? {} : { error: `expected a number, got ${JSON.stringify(value)}` };
  },

  cubicBezier(value) {
    if (!Array.isArray(value) || value.length !== 4 || !value.every(isNumber)) {
      return { error: 'expected an array of 4 numbers' };
    }
    if (value[0] < 0 || value[0] > 1 || value[2] < 0 || value[2] > 1) {
      return { error: 'the x values (first and third) must be between 0 and 1' };
    }
    return {};
  },

  strokeStyle(value) {
    if (typeof value === 'string') {
      return STROKE_STYLES.has(value) ? {} : { error: `unknown stroke style ${JSON.stringify(value)}` };
    }
    if (isObject(value) && Array.isArray(value.dashArray) && typeof value.lineCap === 'string') return {};
    return { error: 'expected a keyword or an object with dashArray and lineCap' };
  },
};

// Composite types hold other tokens' values. Their sub-values are checked by
// the same rules, so only the required keys are asserted here.
const COMPOSITE_KEYS = {
  border: ['color', 'width', 'style'],
  transition: ['duration', 'delay', 'timingFunction'],
  shadow: ['color', 'offsetX', 'offsetY', 'blur'],
  typography: ['fontFamily', 'fontSize', 'fontWeight', 'lineHeight'],
};

/**
 * Check one token value against its type.
 * Returns { error } for a violation, { legacy } for a pre-2025.10 form that
 * still builds, or {} when the value is fine.
 */
export function checkValue(type, value) {
  if (!type) return {};

  if (type === 'gradient') {
    if (!Array.isArray(value) || value.length === 0) {
      return { error: 'expected an array of gradient stops' };
    }
    return {};
  }

  const requiredKeys = COMPOSITE_KEYS[type];
  if (requiredKeys) {
    if (!isObject(value)) return { error: `expected an object with ${requiredKeys.join(', ')}` };
    const missing = requiredKeys.filter((key) => value[key] === undefined);
    if (missing.length) return { error: `missing ${missing.join(', ')}` };
    return {};
  }

  const check = CHECKS[type];
  return check ? check(value) : {};
}

export { COLOR_SPACES, FONT_WEIGHTS };
