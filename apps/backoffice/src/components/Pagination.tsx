import { ChevronLeft, ChevronRight } from 'lucide-react';

import { formatNumber } from '../lib/format';

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(total, page * pageSize);
  return (
    <nav aria-label="Paginação" className="flex items-center justify-between gap-4 pt-4">
      <p className="text-pequeno text-cinza-texto">
        {formatNumber(first)}–{formatNumber(last)} de {formatNumber(total)}
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => onPage(page - 1)}
          disabled={page <= 1}
          aria-label="Página anterior"
          className="flex size-12 items-center justify-center rounded-campo border border-cinza-contorno bg-branco disabled:opacity-40"
        >
          <ChevronLeft size={20} aria-hidden="true" />
        </button>
        <span className="text-pequeno">
          Página {page} de {pages}
        </span>
        <button
          type="button"
          onClick={() => onPage(page + 1)}
          disabled={page >= pages}
          aria-label="Página seguinte"
          className="flex size-12 items-center justify-center rounded-campo border border-cinza-contorno bg-branco disabled:opacity-40"
        >
          <ChevronRight size={20} aria-hidden="true" />
        </button>
      </div>
    </nav>
  );
}
