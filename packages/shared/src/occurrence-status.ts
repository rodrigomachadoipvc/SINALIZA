export const OccurrenceStatus = {
  RECEBIDA: 'RECEBIDA',
  EM_ANALISE: 'EM_ANALISE',
  EM_RESOLUCAO: 'EM_RESOLUCAO',
  RESOLVIDA: 'RESOLVIDA',
  REJEITADA: 'REJEITADA',
  DUPLICADA: 'DUPLICADA',
  ANULADA: 'ANULADA',
} as const;

export type OccurrenceStatus = (typeof OccurrenceStatus)[keyof typeof OccurrenceStatus];

export const OCCURRENCE_STATUSES: readonly OccurrenceStatus[] = Object.values(OccurrenceStatus);

export const STATUS_LABELS: Readonly<Record<OccurrenceStatus, string>> = {
  RECEBIDA: 'Recebida',
  EM_ANALISE: 'Em Análise',
  EM_RESOLUCAO: 'Em Resolução',
  RESOLVIDA: 'Resolvida',
  REJEITADA: 'Rejeitada',
  DUPLICADA: 'Duplicada',
  ANULADA: 'Anulada',
};

/** Lucide icon name per status (the status badge never relies on colour alone). */
export const STATUS_ICONS: Readonly<Record<OccurrenceStatus, string>> = {
  RECEBIDA: 'clock',
  EM_ANALISE: 'search',
  EM_RESOLUCAO: 'flag',
  RESOLVIDA: 'circle-check',
  REJEITADA: 'x',
  DUPLICADA: 'copy',
  ANULADA: 'ban',
};

/** Statuses still being handled by the municipality. */
export const OPEN_STATUSES: readonly OccurrenceStatus[] = [
  OccurrenceStatus.RECEBIDA,
  OccurrenceStatus.EM_ANALISE,
  OccurrenceStatus.EM_RESOLUCAO,
];

/** Cancelled occurrences are hidden from the public map and the citizen's lists. */
export const PUBLIC_STATUSES: readonly OccurrenceStatus[] = OCCURRENCE_STATUSES.filter(
  (s) => s !== OccurrenceStatus.ANULADA,
);

/** Filter groups used by `GET /occurrences/mine?status=`. */
export const CitizenStatusGroup = {
  TODAS: 'todas',
  EM_CURSO: 'em_curso',
  RESOLVIDAS: 'resolvidas',
  REJEITADAS: 'rejeitadas',
} as const;

export type CitizenStatusGroup = (typeof CitizenStatusGroup)[keyof typeof CitizenStatusGroup];

export const CITIZEN_STATUS_GROUPS: Readonly<
  Record<CitizenStatusGroup, readonly OccurrenceStatus[]>
> = {
  todas: PUBLIC_STATUSES,
  em_curso: OPEN_STATUSES,
  resolvidas: [OccurrenceStatus.RESOLVIDA],
  rejeitadas: [OccurrenceStatus.REJEITADA],
};

export function isOccurrenceStatus(value: unknown): value is OccurrenceStatus {
  return typeof value === 'string' && (OCCURRENCE_STATUSES as readonly string[]).includes(value);
}
