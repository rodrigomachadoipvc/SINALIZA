const TIME_ZONE = 'Europe/Lisbon';

const dateFormat = new Intl.DateTimeFormat('pt-PT', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
});

const dateTimeFormat = new Intl.DateTimeFormat('pt-PT', {
  timeZone: TIME_ZONE,
  day: '2-digit',
  month: '2-digit',
  year: 'numeric',
  hour: '2-digit',
  minute: '2-digit',
});

const monthFormat = new Intl.DateTimeFormat('pt-PT', {
  timeZone: 'UTC',
  month: 'short',
  year: '2-digit',
});

/** 30/10/2026 */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** 30/10/2026, 18:42 */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** `2026-03` → «mar. 26» */
export function formatMonth(month: string): string {
  return monthFormat.format(new Date(`${month}-01T00:00:00Z`));
}

export function formatNumber(value: number, digits = 0): string {
  return value.toLocaleString('pt-PT', {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
}

/** 0.125 → «12,5 %» */
export function formatPercent(ratio: number): string {
  return `${formatNumber(ratio * 100, 1)} %`;
}

export function formatDays(days: number | null): string {
  if (days === null) return '—';
  const rounded = Math.round(days * 10) / 10;
  return `${formatNumber(rounded, Number.isInteger(rounded) ? 0 : 1)} ${rounded === 1 ? 'dia' : 'dias'}`;
}

/** Today in Lisbon as YYYY-MM-DD (for date inputs). */
export function todayIso(now = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE }).format(now);
}
