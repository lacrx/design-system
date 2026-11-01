export function createConfig({ source = 'tokens', output = 'dist' } = {}) {
  return {
    source: [`${source}/**/*.json`],
    platforms: {
      css: {
        transformGroup: 'css',
        buildPath: output.endsWith('/') ? output : `${output}/`,
        files: [
          {
            destination: 'tokens.css',
            format: 'css/variables',
            options: {
              outputReferences: true,
            },
          },
        ],
      },
    },
  };
}
