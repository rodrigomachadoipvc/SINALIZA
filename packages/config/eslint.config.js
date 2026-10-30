// Base flat config shared by every package. Packages extend it in their own eslint.config.js.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * @param {{ tsconfigRootDir?: string }} [options] set tsconfigRootDir to enable type-aware rules.
 */
export function baseConfig(options = {}) {
  const typed = Boolean(options.tsconfigRootDir);
  return tseslint.config(
    { ignores: ['**/dist/**', '**/coverage/**', '**/node_modules/**', '**/.expo/**'] },
    js.configs.recommended,
    ...(typed ? tseslint.configs.recommendedTypeChecked : tseslint.configs.recommended),
    {
      languageOptions: {
        globals: { ...globals.node },
        ...(typed
          ? {
              parserOptions: {
                projectService: true,
                tsconfigRootDir: options.tsconfigRootDir,
              },
            }
          : {}),
      },
      rules: {
        '@typescript-eslint/no-unused-vars': [
          'error',
          { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
        ],
        '@typescript-eslint/consistent-type-imports': 'error',
        eqeqeq: ['error', 'always'],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
      },
    },
    {
      files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
      ...tseslint.configs.disableTypeChecked,
    },
    prettier,
  );
}

export default baseConfig();
