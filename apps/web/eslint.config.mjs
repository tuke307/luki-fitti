import { nextJsConfig } from '@luki-fitti/eslint-config/next';

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: ['.next/**'],
  },
  ...nextJsConfig,
];
