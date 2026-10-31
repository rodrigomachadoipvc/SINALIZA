import { OCCURRENCE_STATUSES, type OccurrenceStatus, STATUS_LABELS } from '@sinaliza/shared';
import { ArrowDown, ArrowUp, ArrowUpDown, Search } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { Link, useSearchParams } from 'react-router';

import { errorMessage } from '../api/client';
import { useCategories, useOccurrences } from '../api/queries';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card, PageHeader } from '../components/Card';
import { Chip } from '../components/Chip';
import { SelectField, TextField } from '../components/Field';
import { Pagination } from '../components/Pagination';
import { PageLoading } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatNumber } from '../lib/format';

const PAGE_SIZE = 20;

type SortKey = 'reference' | 'category' | 'status' | 'createdAt';

const COLUMNS: Array<{ key: SortKey | null; label: string }> = [
  { key: 'reference', label: 'Referência' },
  { key: 'category', label: 'Categoria' },
  { key: null, label: 'Morada' },
  { key: 'status', label: 'Estado' },
  { key: 'createdAt', label: 'Data' },
  { key: null, label: 'Dias em aberto' },
];

/** Filters live in the URL, so a filtered list can be bookmarked, shared and survives a reload. */
export function OccurrencesPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const statuses = (params.get('status') ?? '').split(',').filter(Boolean) as OccurrenceStatus[];
  const category = params.get('category') ?? '';
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const sort = params.get('sort') ?? '-createdAt';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const [search, setSearch] = useState(q);

  const categories = useCategories();
  const list = useOccurrences({
    q,
    status: statuses.join(','),
    category,
    from,
    to,
    sort,
    page,
    pageSize: PAGE_SIZE,
  });

  /** Changes some filters; any filter change goes back to page 1. */
  const update = (changes: Record<string, string>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(changes)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!keepPage) next.delete('page');
    setParams(next);
  };

  const toggleStatus = (status: OccurrenceStatus) => {
    const next = statuses.includes(status)
      ? statuses.filter((s) => s !== status)
      : [...statuses, status];
    update({ status: next.join(',') });
  };

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    update({ q: search.trim() });
  };

  const sortBy = (key: SortKey) => {
    const next =
      sort === key ? `-${key}` : sort === `-${key}` ? key : key === 'createdAt' ? `-${key}` : key;
    update({ sort: next === '-createdAt' ? '' : next }, true);
  };

  const ariaSort = (key: SortKey) =>
    sort === key ? 'ascending' : sort === `-${key}` ? 'descending' : 'none';

  const hasFilters = Boolean(q || statuses.length || category || from || to);

  return (
    <>
      <PageHeader title="Ocorrências" />
      <Card className="mb-6">
        <form onSubmit={onSearch} className="flex items-end gap-3" role="search">
          <div className="flex-1">
            <TextField
              label="Pesquisar"
              placeholder="Referência, morada ou descrição"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" icon={<Search size={20} aria-hidden="true" />}>
            Pesquisar
          </Button>
        </form>

        <fieldset className="mt-4">
          <legend className="text-pequeno font-medium">Estado</legend>
          <div className="flex flex-wrap gap-x-2">
            {OCCURRENCE_STATUSES.map((s) => (
              <Chip key={s} selected={statuses.includes(s)} onToggle={() => toggleStatus(s)}>
                {s === 'ANULADA' ? 'Anuladas' : STATUS_LABELS[s]}
              </Chip>
            ))}
          </div>
        </fieldset>

        <div className="mt-2 grid grid-cols-4 items-end gap-4">
          <SelectField
            label="Categoria"
            value={category}
            onChange={(e) => update({ category: e.target.value })}
          >
            <option value="">Todas as categorias</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
                {c.active ? '' : ' (inativa)'}
              </option>
            ))}
          </SelectField>
          <TextField
            label="De"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => update({ from: e.target.value })}
          />
          <TextField
            label="Até"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => update({ to: e.target.value })}
          />
          <div>
            {hasFilters ? (
              <Button
                variant="text"
                onClick={() => {
                  setSearch('');
                  setParams(new URLSearchParams(sort === '-createdAt' ? {} : { sort }));
                }}
              >
                Limpar filtros
              </Button>
            ) : null}
          </div>
        </div>
      </Card>

      <Card>
        {list.isError ? <Alert kind="error">{errorMessage(list.error)}</Alert> : null}
        {list.isPending ? (
          <PageLoading />
        ) : list.data ? (
          <>
            <p className="mb-2 text-pequeno text-cinza-texto" aria-live="polite">
              {formatNumber(list.data.total)}{' '}
              {list.data.total === 1 ? 'ocorrência encontrada' : 'ocorrências encontradas'}
            </p>
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="border-b-2 border-cinza-divisoria">
                    {COLUMNS.map(({ key, label }) => (
                      <th
                        key={label}
                        scope="col"
                        aria-sort={key ? ariaSort(key) : undefined}
                        className="py-2 pr-4 text-pequeno font-semibold"
                      >
                        {key ? (
                          <button
                            type="button"
                            onClick={() => sortBy(key)}
                            className="flex min-h-12 items-center gap-1"
                          >
                            {label}
                            {sort === key ? (
                              <ArrowUp size={16} aria-hidden="true" />
                            ) : sort === `-${key}` ? (
                              <ArrowDown size={16} aria-hidden="true" />
                            ) : (
                              <ArrowUpDown
                                size={16}
                                className="text-cinza-texto"
                                aria-hidden="true"
                              />
                            )}
                          </button>
                        ) : (
                          label
                        )}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {list.data.items.map((o) => (
                    <tr key={o.id} className="border-b border-cinza-divisoria hover:bg-cinza-claro">
                      <td className="py-3 pr-4 font-semibold whitespace-nowrap">
                        <Link to={`/ocorrencias/${o.id}`} className="underline underline-offset-4">
                          {o.reference}
                        </Link>
                      </td>
                      <td className="py-3 pr-4">{o.category.name}</td>
                      <td className="py-3 pr-4 text-cinza-texto">{o.address}</td>
                      <td className="py-3 pr-4">
                        <StatusBadge status={o.status} />
                      </td>
                      <td className="py-3 pr-4 whitespace-nowrap">{formatDate(o.createdAt)}</td>
                      <td className="py-3 pr-4 text-right tabular-nums">{o.daysOpen}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {list.data.items.length === 0 ? (
              <p className="py-8 text-center text-cinza-texto">
                Não há ocorrências com estes filtros.
              </p>
            ) : null}
            <Pagination
              page={list.data.page}
              pageSize={list.data.pageSize}
              total={list.data.total}
              onPage={(p) => update({ page: p > 1 ? String(p) : '' }, true)}
            />
          </>
        ) : null}
      </Card>
    </>
  );
}
