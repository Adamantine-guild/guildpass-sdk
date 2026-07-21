const tsParser = require('@typescript-eslint/parser');
const tsPlugin = require('@typescript-eslint/eslint-plugin');

module.exports = [
  {
    files: ['src/**/*.ts', 'tests/**/*.ts', 'examples/**/*.ts'],
    languageOptions: {
      parser: tsParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
      },
    },
    plugins: {
      '@typescript-eslint': tsPlugin,
    },
    rules: {
      ...tsPlugin.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/explicit-function-return-type': 'off',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
      // Guard against the import conflicts described in #83: catch the same
      // module being imported twice, and keep `RequestOptions` sourced only from
      // its canonical module (../types/common), never re-introduced in http.types.
      'no-duplicate-imports': 'error',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/http/http.types'],
              importNames: ['RequestOptions'],
              message:
                'Import RequestOptions from "../types/common" (the canonical request-options type). http.types must not redeclare it.',
            },
          ],
        },
      ],
    },
  },
];
