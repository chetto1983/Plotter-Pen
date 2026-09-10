const path = require('path');

// Oldest industrial HMI browser we support. Babel 8 no longer falls back to "all browsers":
// without explicit targets it uses browserslist "defaults", so this must stay explicit.
// NOTE: keep all Babel config inline in this file — the Docker frontend stage only copies
// package.json, package-lock.json, webpack.config.cjs and src/, so a separate
// babel.config.* / .browserslistrc would be silently ignored there.
const BABEL_TARGETS = { firefox: '78' };

module.exports = {
  mode: 'production',
  entry: './src/main.js',
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: 'bundle.js',
    publicPath: '/dist/',
    clean: true,
  },
  module: {
    rules: [
      {
        // Application code: syntax lowering + core-js usage polyfills.
        test: /\.m?js$/,
        exclude: /node_modules/,
        use: {
          loader: 'babel-loader',
          options: {
            // Top-level so that BOTH preset-env and the polyfill plugin use the same targets.
            targets: BABEL_TARGETS,
            // Babel 8: `bugfixes` was removed (now always on); `useBuiltIns`/`corejs` were removed
            // from preset-env in favour of babel-plugin-polyfill-corejs3 (below).
            presets: ['@babel/preset-env'],
            plugins: [
              // Same polyfilling as Babel 7 `useBuiltIns: 'usage', corejs: 3` (i.e. core-js "3.0").
              // Raising `version` to the installed core-js minor would inject additional polyfills.
              ['babel-plugin-polyfill-corejs3', { method: 'usage-global', version: '3.0' }],
            ],
          },
        },
      },
      {
        // three.js >= r186 ships ES2022 class static blocks (`static { ... }` in Vector2/3/4,
        // Matrix2/3/4) that Firefox < 93 cannot parse — the whole bundle would fail to load.
        // Lower its syntax to the same targets. Syntax only: no polyfill injection, exactly as
        // before when node_modules was not transpiled at all.
        test: /\.m?js$/,
        include: path.resolve(__dirname, 'node_modules/three'),
        use: {
          loader: 'babel-loader',
          options: {
            targets: BABEL_TARGETS,
            presets: ['@babel/preset-env'],
            // three.core.js is > 500 KB; avoid Babel's "deoptimised the styling" note (Terser minifies anyway).
            compact: true,
          },
        },
      },
    ],
  },
  resolve: {
    extensions: ['.js'],
    alias: {
      'three/addons': path.resolve(__dirname, 'node_modules/three/examples/jsm'),
    },
  },
};
