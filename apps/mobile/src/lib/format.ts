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

const monthYearFormat = new Intl.DateTimeFormat('pt-PT', {
  timeZone: TIME_ZONE,
  month: 'long',
  year: 'numeric',
});

const dayKey = new Intl.DateTimeFormat('en-CA', { timeZone: TIME_ZONE });

/** 30/10/2026 */
export function formatDate(iso: string): string {
  return dateFormat.format(new Date(iso));
}

/** 30/10/2026, 18:42 */
export function formatDateTime(iso: string): string {
  return dateTimeFormat.format(new Date(iso));
}

/** «outubro de 2026» */
export function formatMonthYear(iso: string): string {
  return monthYearFormat.format(new Date(iso));
}

/** Calendar days between two instants, counted in Lisbon time. */
function daysBetween(iso: string, now: Date): number {
  const a = Date.parse(dayKey.format(new Date(iso)));
  const b = Date.parse(dayKey.format(now));
  return Math.round((b - a) / 86_400_000);
}

/** «Hoje», «Ontem», «Há 3 dias», «Há 2 meses». */
export function relativeDay(iso: string, now = new Date()): string {
  const days = daysBetween(iso, now);
  if (days <= 0) return 'Hoje';
  if (days === 1) return 'Ontem';
  if (days < 30) return `Há ${days} dias`;
  const months = Math.floor(days / 30);
  if (months < 12) return months === 1 ? 'Há 1 mês' : `Há ${months} meses`;
  const years = Math.floor(days / 365);
  return years <= 1 ? 'Há 1 ano' : `Há ${years} anos`;
}

/** «Maria Fernandes» → «MF». */
export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts[0]?.[0] ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.[0] ?? '') : '';
  return (first + last).toUpperCase();
}

/** First name for friendly messages («Obrigado, Maria»). */
export function firstName(name: string): string {
  return name.trim().split(/\s+/)[0] ?? name;
}
