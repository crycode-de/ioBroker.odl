import { defineConfig } from 'eslint/config';

import crycode from '@crycode/eslint-config';

export default defineConfig(
  ...crycode.configs.ts,
  ...crycode.configs.stylistic,

  {
    ignores: [
      '.dev-server/',
      '.vscode/',
      '*.test.js',
      'test/**/*.js',
      '*.config.mjs',
      'build',
      'dist',
      'admin/build',
      'admin/words.js',
      'admin/admin.d.ts',
      'admin/blockly.js',
      '**/adapter-config.d.ts',
    ],
  },

  {
    files: [
      'src/**/*',
    ],

    languageOptions: {
      parserOptions: {
        ecmaVersion: 2022,
        sourceType: 'module',
        project: [
          './tsconfig.json',
        ],
      },
    },

  },
);
