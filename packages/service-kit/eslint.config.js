import { baseConfig } from '@sinaliza/config/eslint';

export default baseConfig({ tsconfigRootDir: import.meta.dirname, nest: true });
