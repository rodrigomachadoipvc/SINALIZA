// Prints the ✅/❌ table per requirement from Vitest's JSON report.
/* eslint-disable no-console -- command-line output */
// Usage: node src/summary.ts <report.json>   (exit code 1 when any requirement fails)
import { existsSync, readFileSync } from 'node:fs';

const REQUIREMENTS: ReadonlyArray<[string, string]> = [
  ['SEED', 'Dados de demonstração'],
  ['RF01', 'Registo e autenticação'],
  ['RF02', 'Controlo de acesso por perfil (RBAC)'],
  ['RF03', 'Registar ocorrência'],
  ['RF04', 'As minhas ocorrências'],
  ['RF05', 'Email a cada mudança de estado'],
  ['RF06', 'Validar/rejeitar com fundamentação'],
  ['RF07', 'Alterar categoria'],
  ['RF08', 'Ciclo de vida da ocorrência'],
  ['RF09', 'Duplicada → original'],
  ['RF10', 'Admin gere categorias e gestores'],
  ['RF11', 'Mapas e geolocalização'],
  ['RF12', 'Validar localização dentro de Barcelos'],
  ['RF13', 'Recuperar palavra-passe'],
  ['RF14', 'Detalhe e histórico'],
  ['RF15', 'Mapa público sem autor'],
  ['RF16', 'Pesquisa e filtros (gestor)'],
  ['RF17', 'Dashboard de indicadores'],
  ['RF18', 'Perfil'],
  ['RF19', 'Rever antes de submeter + referência'],
  ['RF20', 'Anular enquanto Recebida'],
];

interface AssertionResult {
  title: string;
  status: 'passed' | 'failed' | 'skipped' | 'pending' | 'todo' | 'disabled';
  failureMessages?: string[];
}

interface Report {
  testResults?: Array<{ assertionResults?: AssertionResult[]; message?: string }>;
}

const file = process.argv[2];
let results: AssertionResult[] = [];
let fileError: string | undefined;
if (file && existsSync(file)) {
  const report = JSON.parse(readFileSync(file, 'utf8')) as Report;
  results = (report.testResults ?? []).flatMap((r) => r.assertionResults ?? []);
  fileError = report.testResults?.find((r) => r.message)?.message;
} else {
  fileError = `relatório não encontrado: ${file ?? '(nenhum)'}`;
}

let failed = 0;
console.log('\nRequisito  Resultado  Descrição');
console.log('─────────  ─────────  ─────────────────────────────────────────');
for (const [code, label] of REQUIREMENTS) {
  const tests = results.filter((t) => t.title.startsWith(`${code} `));
  const ok = tests.length > 0 && tests.every((t) => t.status === 'passed');
  if (!ok) failed++;
  const passed = tests.filter((t) => t.status === 'passed').length;
  console.log(
    `${code.padEnd(9)}  ${ok ? '✅' : '❌'} ${`${passed}/${tests.length}`.padEnd(6)}  ${label}`,
  );
  for (const t of tests.filter((x) => x.status === 'failed')) {
    const reason = (t.failureMessages?.[0] ?? '').split('\n')[0]?.slice(0, 160);
    console.log(`           ↳ ${t.title}\n             ${reason}`);
  }
}
if (fileError) console.log(`\n${fileError.split('\n')[0]}`);
console.log(
  failed === 0
    ? `\nTodos os ${REQUIREMENTS.length} itens passaram. ✅`
    : `\n${failed} de ${REQUIREMENTS.length} itens falharam. ❌`,
);
process.exitCode = failed === 0 ? 0 : 1;
