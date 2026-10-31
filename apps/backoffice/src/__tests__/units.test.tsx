import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

import { CATEGORY_ICONS, OCCURRENCE_STATUSES, STATUS_LABELS } from '@sinaliza/shared';
import { act, render, renderHook, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { useInactivity } from '../auth/useInactivity';
import type { Dashboard } from '../api/types';
import { CATEGORY_ICON_COMPONENTS } from '../components/icons';
import { STATUS_BG, STATUS_HEX, StatusBadge } from '../components/StatusBadge';
import { formatDateTime, formatDays, formatPercent, todayIso } from '../lib/format';
import { SourceIndicator } from '../pages/DashboardPage';

describe('icons and status colours', () => {
  it('has a Lucide component for every category icon the API accepts', () => {
    for (const name of CATEGORY_ICONS) expect(CATEGORY_ICON_COMPONENTS[name]).toBeDefined();
  });

  it('has a colour for every status', () => {
    for (const status of OCCURRENCE_STATUSES) {
      expect(STATUS_BG[status]).toMatch(/^bg-estado-/);
      expect(STATUS_HEX[status]).toMatch(/^#[0-9a-f]{6}$/i);
    }
  });

  it('shows the status with its label, not only its colour', () => {
    render(<StatusBadge status="EM_RESOLUCAO" />);
    expect(screen.getByText(STATUS_LABELS.EM_RESOLUCAO)).toBeInTheDocument();
  });

  it('uses the shared logo symbol as the favicon', () => {
    const read = (path: string) =>
      readFileSync(fileURLToPath(new URL(path, import.meta.url)), 'utf8');
    expect(read('../../public/logo-symbol.svg')).toBe(
      read('../../../../packages/shared/assets/logo-symbol.svg'),
    );
  });
});

describe('format', () => {
  it('formats days, percentages and today in Lisbon', () => {
    expect(formatDays(null)).toBe('—');
    expect(formatDays(1)).toBe('1 dia');
    expect(formatDays(3.46)).toBe('3,5 dias');
    expect(formatPercent(0.125)).toBe('12,5 %');
    expect(todayIso(new Date('2026-10-31T23:30:00Z'))).toBe('2026-10-31');
    expect(todayIso(new Date('2026-07-31T23:30:00Z'))).toBe('2026-08-01');
  });
});

describe('useInactivity', () => {
  afterEach(() => vi.useRealTimers());

  it('warns a minute before the limit and ends the session at the limit', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useInactivity(5 * 60_000, 60_000, onTimeout));

    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    expect(result.current.warning).toBe(false);

    // Activity before the warning resets the clock.
    act(() => {
      window.dispatchEvent(new Event('keydown'));
    });
    act(() => {
      vi.advanceTimersByTime(3 * 60_000 + 30_000);
    });
    expect(result.current.warning).toBe(false);

    act(() => {
      vi.advanceTimersByTime(31_000);
    });
    expect(result.current.warning).toBe(true);

    // Activity during the warning does not dismiss it; only «Continuar sessão» does.
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    act(() => {
      vi.advanceTimersByTime(60_000);
    });
    expect(onTimeout).toHaveBeenCalledTimes(1);
  });

  it('keeps the session when the user chooses to continue', () => {
    vi.useFakeTimers();
    const onTimeout = vi.fn();
    const { result } = renderHook(() => useInactivity(5 * 60_000, 60_000, onTimeout));
    act(() => {
      vi.advanceTimersByTime(4 * 60_000 + 10_000);
    });
    expect(result.current.warning).toBe(true);
    act(() => {
      result.current.stayActive();
    });
    expect(result.current.warning).toBe(false);
    act(() => {
      vi.advanceTimersByTime(3 * 60_000);
    });
    expect(onTimeout).not.toHaveBeenCalled();
  });
});

describe('SourceIndicator', () => {
  const base = { updatedAt: '2026-10-31T14:43:42.638Z' } as Dashboard;

  it('shows when the Databricks gold layer was computed', () => {
    render(<SourceIndicator data={{ ...base, source: 'databricks' }} />);
    expect(
      screen.getByText(`Databricks · atualizado a ${formatDateTime(base.updatedAt)}`),
    ).toBeInTheDocument();
  });

  it('names the operational database otherwise', () => {
    render(<SourceIndicator data={{ ...base, source: 'postgres' }} />);
    expect(screen.getByText('Base de dados operacional')).toBeInTheDocument();
  });
});
