import globals from 'globals';
import { nextJsConfig } from '@luki-fitti/eslint-config/next';

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: ['.next/**', '.source/**', 'content/**'],
  },
  ...nextJsConfig,
  {
    // Node runtime config files and repo scripts (next.config.js, prepare-docs.mjs).
    files: ['*.config.js', '*.config.mjs', '*.config.cjs', 'scripts/*.mjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
