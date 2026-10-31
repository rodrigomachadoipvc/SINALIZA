import { type OccurrenceStatus, STATUS_LABELS } from '@sinaliza/shared';

import { STATUS_ICON_COMPONENTS } from './icons';

/** Background per status; white text on each has at least 4.5:1 contrast (AA). */
export const STATUS_BG: Record<OccurrenceStatus, string> = {
  RECEBIDA: 'bg-estado-recebida',
  EM_ANALISE: 'bg-estado-em-analise',
  EM_RESOLUCAO: 'bg-estado-em-resolucao',
  RESOLVIDA: 'bg-estado-resolvida',
  REJEITADA: 'bg-estado-rejeitada',
  DUPLICADA: 'bg-estado-duplicada',
  ANULADA: 'bg-estado-anulada',
};

export const STATUS_HEX: Record<OccurrenceStatus, string> = {
  RECEBIDA: '#4B5563',
  EM_ANALISE: '#1565C0',
  EM_RESOLUCAO: '#B45309',
  RESOLVIDA: '#2E7D32',
  REJEITADA: '#C62828',
  DUPLICADA: '#546E7A',
  ANULADA: '#6B7280',
};

/** Status label: colour + icon + text, so it never depends on colour alone. */
export function StatusBadge({ status }: { status: OccurrenceStatus }) {
  const Icon = STATUS_ICON_COMPONENTS[status];
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-3 py-1 text-legenda font-semibold whitespace-nowrap text-branco ${STATUS_BG[status]}`}
    >
      <Icon size={14} strokeWidth={2.5} aria-hidden="true" />
      {STATUS_LABELS[status]}
    </span>
  );
}
