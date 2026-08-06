import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: [
      '**/dist/**',
      '**/node_modules/**',
      'apps/api/uploads/**',
      'apps/web/public/**',
    ],
  },
  ...tseslint.configs.recommended,
  {
    files: ['apps/**/*.{ts,tsx}'],
    rules: {
      // Generic API serialization intentionally uses unknown record shapes.
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
        },
      ],
    },
  },
);
