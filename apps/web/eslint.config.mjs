import globals from 'globals';
import { nextJsConfig } from '@luki-fitti/eslint-config/next';

/** @type {import("eslint").Linter.Config[]} */
export default [
  {
    ignores: ['.next/**'],
  },
  ...nextJsConfig,
  {
    // Node runtime config files (next.config.js, instrumentation edge cases).
    files: ['*.config.js', '*.config.mjs', '*.config.cjs'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
  },
];
