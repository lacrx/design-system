// Shared Stylelint config: forces every visual value through a design token.
//
// The property list below is the enforcement half of the rules written into a
// consuming project's CLAUDE.md by `design-system init` (see
// templates/claude-md-design.md). A rule documented there is enforced here.

// `border` and `background` are deliberately absent: `expandShorthand` splits
// them and checks the longhands below, so `border: 1px solid var(--x)` passes
// while `border: 1px solid #ccc` is caught on its colour.
const COLOR_PROPS = [
  'color',
  'background-color',
  'border-color',
  'border-top-color',
  'border-right-color',
  'border-bottom-color',
  'border-left-color',
  'outline-color',
  'box-shadow',
  'text-decoration-color',
  'fill',
  'stroke',
];

const SPACING_PROPS = [
  'margin',
  'margin-top',
  'margin-right',
  'margin-bottom',
  'margin-left',
  'margin-block',
  'margin-inline',
  'padding',
  'padding-top',
  'padding-right',
  'padding-bottom',
  'padding-left',
  'padding-block',
  'padding-inline',
  'gap',
  'row-gap',
  'column-gap',
];

const RADIUS_PROPS = ['border-radius'];

const TYPE_PROPS = ['font-size', 'font-family'];

// Values that are not design decisions and so never need a token. Zero, auto
// and percentages are layout maths; the keywords are CSS plumbing.
//
// NOTE: ignoreValues must stay a flat array. The hash form keyed by property
// regex is documented by the plugin but does not match in v1.10.x, so every
// key silently falls through and the whole list stops working. Exact-string
// keys do work if per-property sets are ever needed.
const IGNORED_VALUES = [
  // color-mix is only allowed when it is mixing tokens, not raw colours.
  '/^color-mix\\(.*var\\(--.*\\)$/',
  'transparent',
  'inherit',
  'currentColor',
  'currentcolor',
  'none',
  'initial',
  'unset',
  'revert',
  'auto',
  '0',
  '/^-?\\d+(\\.\\d+)?%$/',
  '/^-?\\d+(\\.\\d+)?fr$/',
];

module.exports = {
  plugins: ['stylelint-declaration-strict-value'],
  rules: {
    'scale-unlimited/declaration-strict-value': [
      [...COLOR_PROPS, ...SPACING_PROPS, ...RADIUS_PROPS, ...TYPE_PROPS],
      {
        ignoreValues: IGNORED_VALUES,
        // By default ANY function counts as an acceptable substitute for a
        // token, so `color: rgb(0 0 0)` would pass. Colours must come from a
        // variable; the size properties keep functions because calc() and
        // clamp() on top of tokens are legitimate.
        //
        // NOTE: exact property keys work here, regex keys do not (see above).
        ignoreFunctions: Object.fromEntries([['', true], ...COLOR_PROPS.map((p) => [p, false])]),
        expandShorthand: true,
        disableFix: true,
        // Placeholders are ${types}, ${value} and ${property}. The `{{ x }}`
        // form is not interpolated and ships the literal braces to the user.
        message:
          'Use a design token (CSS custom property) instead of "${value}" for ${property}',
      },
    ],

    // Ban named colors (red, blue, etc.)
    'color-named': 'never',
  },
};
