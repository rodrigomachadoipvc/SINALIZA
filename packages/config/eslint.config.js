// Base flat config shared by every package. Packages extend it in their own eslint.config.js.
import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/**
 * @param {{ tsconfigRootDir?: string, nest?: boolean }} [options] set tsconfigRootDir to enable
 *   type-aware rules; set nest for NestJS packages, where `import type` would break DI metadata.
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
        '@typescript-eslint/consistent-type-imports': options.nest ? 'off' : 'error',
        ...(options.nest ? { '@typescript-eslint/no-extraneous-class': 'off' } : {}),
        eqeqeq: ['error', 'always'],
        'no-console': ['warn', { allow: ['warn', 'error'] }],
      },
    },
    {
      // Supertest response bodies are `any`; tests assert on them directly.
      files: ['**/__tests__/**/*.ts', '**/test/**/*.ts'],
      rules: {
        '@typescript-eslint/no-unsafe-argument': 'off',
        '@typescript-eslint/no-unsafe-assignment': 'off',
        '@typescript-eslint/no-unsafe-member-access': 'off',
        '@typescript-eslint/no-unsafe-call': 'off',
        '@typescript-eslint/unbound-method': 'off',
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
