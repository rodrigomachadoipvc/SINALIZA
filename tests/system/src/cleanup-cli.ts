// Removes leftovers of an interrupted run: `pnpm --filter @sinaliza/system-tests cleanup`.
/* eslint-disable no-console -- command-line output */
import { cleanup } from './cleanup.ts';

const result = await cleanup();
console.log(
  `Removidos: ${result.users} contas, ${result.occurrences} ocorrências, ` +
    `${result.categories} categorias, ${result.photos} fotografias e ${result.emails} emails de teste.`,
);
