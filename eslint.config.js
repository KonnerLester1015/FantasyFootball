import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/coverage/**',
      'reference/**',
      'Archived - DONT PUSH TO REPO/**',
      'brag-output/**',
    ],
  },

  js.configs.recommended,
  tseslint.configs.recommended,

  // Browser code
  {
    files: ['apps/web/**/*.{ts,tsx}'],
    languageOptions: {
      globals: globals.browser,
    },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },

  // Node code: the ingest function, scripts, and config files
  {
    files: ['functions/**/*.ts', 'scripts/**/*.ts', '*.config.{js,ts}'],
    languageOptions: {
      globals: globals.node,
    },
  },

  // Shared rules
  {
    files: ['**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': 'off',
    },
  },
);
