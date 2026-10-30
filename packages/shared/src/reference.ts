// Occurrence reference: SIN-YYYY-NNNNN, sequential per year.
export const REFERENCE_PATTERN = /^SIN-(\d{4})-(\d{5,})$/;

export function formatReference(year: number, sequence: number): string {
  if (!Number.isInteger(year) || year < 1000 || year > 9999) {
    throw new RangeError(`Invalid year: ${year}`);
  }
  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new RangeError(`Invalid sequence: ${sequence}`);
  }
  return `SIN-${year}-${String(sequence).padStart(5, '0')}`;
}

export function parseReference(reference: string): { year: number; sequence: number } | null {
  const match = REFERENCE_PATTERN.exec(reference);
  if (!match?.[1] || !match[2]) return null;
  return { year: Number(match[1]), sequence: Number(match[2]) };
}
