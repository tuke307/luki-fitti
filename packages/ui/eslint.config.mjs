import { config } from '@luki-fitti/eslint-config/react-internal';

/** @type {import("eslint").Linter.Config} */
export default [
  ...config,
  {
    settings: {
      'better-tailwindcss': {
        entryPoint: 'src/globals.css',
      },
    },
  },
];
