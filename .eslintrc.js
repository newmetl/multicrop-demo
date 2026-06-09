module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    ecmaVersion: 2020,
    sourceType: 'module'
  },
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  plugins: ['@typescript-eslint'],
  rules: {
    // TypeScript already resolves identifiers; ESLint's no-undef misfires on
    // types and ambient globals, so defer to the compiler (the typescript-eslint
    // recommended pattern).
    'no-undef': 'off',
    // Surface stray debug logging, but allow intentional warn/error reporting.
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    '@typescript-eslint/no-explicit-any': 'warn',
    // Allow deliberately-unused params when prefixed with `_` (e.g. scene.ts's
    // signature-stability args).
    '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }]
  },
  env: {
    browser: true,
    es2020: true,
    node: true
  },
  ignorePatterns: [
    'dist/**',
    'node_modules/**',
    '*.config.js',
    '*.config.ts',
    '.eslintrc.js'
  ]
};
