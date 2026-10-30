import { baseConfig } from '@sinaliza/config/eslint';

export default [
  { ignores: ['src/generated/**'] },
  ...baseConfig({ tsconfigRootDir: import.meta.dirname, nest: true }),
];
