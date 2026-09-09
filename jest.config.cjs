module.exports = {
  testEnvironment: 'node',
  testMatch: ['<rootDir>/tests/**/*.test.js'],
  transform: { '^.+\\.tsx?$': ['babel-jest', { babelrc: false, configFile: false, presets: [['@babel/preset-typescript', { allExtensions: true, isTSX: true }]], plugins: ['@babel/plugin-transform-modules-commonjs'] }] },
  moduleNameMapper: { '^@/(.*)$': '<rootDir>/$1' },
};
