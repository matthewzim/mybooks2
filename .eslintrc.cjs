module.exports = {
  root: true,
  env: { es2022: true, node: true, browser: true, jest: true },
  parser: '@typescript-eslint/parser',
  plugins: ['@typescript-eslint', 'react-hooks'],
  extends: ['eslint:recommended'],
  parserOptions: { ecmaVersion: 'latest', sourceType: 'module', ecmaFeatures: { jsx: true } },
  ignorePatterns: ['node_modules/', '.expo/', 'dist/', 'ios/', 'android/'],
  globals: { __DEV__: 'readonly', Deno: 'readonly' },
  rules: { 'no-undef': 'off', 'no-unused-vars': 'off', 'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn' },
};
