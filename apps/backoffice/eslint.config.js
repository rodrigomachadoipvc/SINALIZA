import { baseConfig } from '@sinaliza/config/eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';

export default [
  { ignores: ['public/**'] },
  ...baseConfig({ tsconfigRootDir: import.meta.dirname }),
  reactHooks.configs.flat['recommended-latest'],
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: { globals: { ...globals.browser } },
    rules: {
      // Event handlers passed to JSX may return promises (react-hook-form's handleSubmit).
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
    },
  },
];
