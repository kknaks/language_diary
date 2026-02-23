import expoConfig from 'eslint-config-expo/flat';
import prettierConfig from 'eslint-config-prettier';

export default [
  ...expoConfig,
  prettierConfig,
  {
    ignores: ['node_modules/', '.expo/', 'dist/', 'babel.config.js'],
  },
];
