module.exports = {
  plugins: ['stylelint-declaration-strict-value'],
  rules: {
    // Enforce CSS custom properties for all color-related declarations
    'scale-unlimited/declaration-strict-value': [
      [
        'color',
        'background',
        'background-color',
        'border',
        'border-color',
        'outline-color',
        'box-shadow',
        'text-decoration-color',
        'fill',
        'stroke',
      ],
      {
        ignoreValues: [
          'transparent',
          'inherit',
          'currentColor',
          'none',
          'initial',
          'unset',
        ],
        disableFix: true,
        message:
          'Use a design token (CSS custom property) instead of a hardcoded value for {{ property }}',
      },
    ],

    // Ban named colors (red, blue, etc.)
    'color-named': 'never',
  },
};
