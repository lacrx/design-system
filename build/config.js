export function createConfig({ source = 'tokens', output = 'dist', filename = 'tokens.css' } = {}) {
  return {
    source: [`${source}/**/*.json`],
    platforms: {
      css: {
        transformGroup: 'css',
        buildPath: output.endsWith('/') ? output : `${output}/`,
        files: [
          {
            destination: filename,
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
