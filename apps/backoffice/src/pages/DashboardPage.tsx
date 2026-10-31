import { STATUS_LABELS } from '@sinaliza/shared';
import { Database, Server } from 'lucide-react';
import type { ReactNode } from 'react';
import { CircleMarker, Tooltip as MapTooltip } from 'react-leaflet';
import { useSearchParams } from 'react-router';
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

import { errorMessage } from '../api/client';
import { useDashboard } from '../api/queries';
import type { Dashboard } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card, PageHeader } from '../components/Card';
import { TextField } from '../components/Field';
import { PageLoading } from '../components/Spinner';
import { STATUS_HEX } from '../components/StatusBadge';
import {
  formatDate,
  formatDateTime,
  formatDays,
  formatMonth,
  formatNumber,
  formatPercent,
} from '../lib/format';
import { BaseMap } from '../map/BaseMap';

// Recharts draws SVG, so it needs the token values themselves rather than Tailwind classes.
const AZUL = '#1a2b4c';
const SUCESSO = '#2e7d32';
const DIVISORIA = '#d1d5db';
const TEXTO = '#4b5563';
const AXIS = { fontSize: 14, fill: TEXTO } as const;

export function DashboardPage() {
  const [params, setParams] = useSearchParams();
  const from = params.get('from') ?? '';
  const to = params.get('to') ?? '';
  const dashboard = useDashboard({ ...(from ? { from } : {}), ...(to ? { to } : {}) });

  const setPeriod = (key: 'from' | 'to', value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  return (
    <>
      <PageHeader title="Dashboard">
        {dashboard.data ? <SourceIndicator data={dashboard.data} /> : null}
      </PageHeader>

      <Card className="mb-6">
        <div className="flex flex-wrap items-end gap-4">
          <TextField
            label="De"
            type="date"
            value={from}
            max={to || undefined}
            onChange={(e) => setPeriod('from', e.target.value)}
          />
          <TextField
            label="Até"
            type="date"
            value={to}
            min={from || undefined}
            onChange={(e) => setPeriod('to', e.target.value)}
          />
          {from || to ? (
            <Button variant="text" onClick={() => setParams(new URLSearchParams())}>
              Repor período
            </Button>
          ) : null}
          {dashboard.data ? (
            <p className="pb-3 text-pequeno text-cinza-texto">
              Período: {formatDate(dashboard.data.period.from)} a{' '}
              {formatDate(dashboard.data.period.to)}
            </p>
          ) : null}
        </div>
      </Card>

      {dashboard.isError ? <Alert kind="error">{errorMessage(dashboard.error)}</Alert> : null}
      {dashboard.isPending ? <PageLoading /> : null}
      {dashboard.data ? <DashboardContent data={dashboard.data} /> : null}
    </>
  );
}

export function SourceIndicator({ data }: { data: Dashboard }) {
  const databricks = data.source === 'databricks';
  const Icon = databricks ? Database : Server;
  return (
    <p className="flex items-center gap-2 rounded-full bg-branco px-4 py-2 text-pequeno font-medium shadow-sm">
      <Icon size={18} aria-hidden="true" />
      {databricks
        ? `Databricks · atualizado a ${formatDateTime(data.updatedAt)}`
        : 'Base de dados operacional'}
    </p>
  );
}

function DashboardContent({ data }: { data: Dashboard }) {
  const t = data.totals;
  const byStatus = data.byStatus.map((s) => ({ ...s, label: STATUS_LABELS[s.status] }));
  const trend = data.monthlyTrend.map((m) => ({ ...m, label: formatMonth(m.month) }));
  const maxHotspot = Math.max(1, ...data.hotspots.map((h) => h.count));

  return (
    <div className="flex flex-col gap-6">
      <div className="grid grid-cols-3 gap-6 2xl:grid-cols-6">
        <Indicator label="Total de ocorrências" value={formatNumber(t.total)} />
        <Indicator label="Em aberto" value={formatNumber(t.open)} />
        <Indicator label="Resolvidas no período" value={formatNumber(t.resolvedInPeriod)} />
        <Indicator label="Tempo médio de resolução" value={formatDays(t.avgResolutionDays)} />
        <Indicator label="Taxa de rejeição" value={formatPercent(t.rejectionRate)} />
        <Indicator label="Taxa de duplicados" value={formatPercent(t.duplicateRate)} />
      </div>

      <div className="grid grid-cols-2 gap-6">
        <ChartCard title="Ocorrências por estado" empty={byStatus.length === 0}>
          <BarChart data={byStatus} layout="vertical" margin={{ left: 24, right: 24 }}>
            <CartesianGrid horizontal={false} stroke={DIVISORIA} />
            <XAxis type="number" allowDecimals={false} tick={AXIS} />
            <YAxis type="category" dataKey="label" width={110} tick={AXIS} />
            <Tooltip formatter={(v) => [formatNumber(Number(v)), 'Ocorrências']} />
            <Bar dataKey="count" name="Ocorrências" radius={[0, 4, 4, 0]}>
              {byStatus.map((s) => (
                <Cell key={s.status} fill={STATUS_HEX[s.status]} />
              ))}
            </Bar>
          </BarChart>
        </ChartCard>

        <ChartCard title="Ocorrências por categoria" empty={data.byCategory.length === 0}>
          <BarChart data={data.byCategory} layout="vertical" margin={{ left: 24, right: 24 }}>
            <CartesianGrid horizontal={false} stroke={DIVISORIA} />
            <XAxis type="number" allowDecimals={false} tick={AXIS} />
            <YAxis type="category" dataKey="name" width={150} tick={AXIS} />
            <Tooltip formatter={(v) => [formatNumber(Number(v)), 'Ocorrências']} />
            <Bar dataKey="count" name="Ocorrências" fill={AZUL} radius={[0, 4, 4, 0]} />
          </BarChart>
        </ChartCard>
      </div>

      <ChartCard title="Evolução mensal" empty={trend.length === 0}>
        <LineChart data={trend} margin={{ left: 8, right: 24, top: 8 }}>
          <CartesianGrid stroke={DIVISORIA} />
          <XAxis dataKey="label" tick={AXIS} />
          <YAxis allowDecimals={false} tick={AXIS} />
          <Tooltip />
          <Legend />
          <Line type="monotone" dataKey="created" name="Criadas" stroke={AZUL} strokeWidth={3} />
          <Line
            type="monotone"
            dataKey="resolved"
            name="Resolvidas"
            stroke={SUCESSO}
            strokeWidth={3}
            strokeDasharray="6 4"
          />
        </LineChart>
      </ChartCard>

      <div className="grid grid-cols-12 gap-6">
        <Card title="Tempo médio de resolução por categoria" className="col-span-12 xl:col-span-5">
          {data.resolutionByCategory.length === 0 ? (
            <p className="text-cinza-texto">Sem ocorrências resolvidas no período.</p>
          ) : (
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-cinza-divisoria text-pequeno">
                  <th scope="col" className="py-2 pr-4 font-semibold">
                    Categoria
                  </th>
                  <th scope="col" className="py-2 pr-4 text-right font-semibold">
                    Resolvidas
                  </th>
                  <th scope="col" className="py-2 text-right font-semibold">
                    Tempo médio
                  </th>
                </tr>
              </thead>
              <tbody>
                {data.resolutionByCategory.map((r) => (
                  <tr key={r.slug} className="border-b border-cinza-divisoria">
                    <td className="py-3 pr-4">{r.name}</td>
                    <td className="py-3 pr-4 text-right tabular-nums">
                      {formatNumber(r.resolved)}
                    </td>
                    <td className="py-3 text-right tabular-nums">{formatDays(r.avgDays)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </Card>

        <Card title="Zonas com mais ocorrências" className="col-span-12 xl:col-span-7">
          <BaseMap label="Mapa das zonas com mais ocorrências" className="h-96">
            {data.hotspots.map((h) => (
              <CircleMarker
                key={`${h.lat},${h.lng}`}
                center={[h.lat, h.lng]}
                radius={6 + 18 * Math.sqrt(h.count / maxHotspot)}
                pathOptions={{ color: AZUL, weight: 2, fillColor: '#ffc107', fillOpacity: 0.7 }}
              >
                <MapTooltip>
                  {h.count} {h.count === 1 ? 'ocorrência' : 'ocorrências'}
                </MapTooltip>
              </CircleMarker>
            ))}
          </BaseMap>
          <p className="mt-2 text-legenda text-cinza-texto">
            Cada círculo agrupa as ocorrências de uma zona; o tamanho é proporcional ao número.
          </p>
        </Card>
      </div>
    </div>
  );
}

function Indicator({ label, value }: { label: string; value: string }) {
  return (
    <section className="rounded-cartao border-l-4 border-amarelo bg-branco p-5 shadow-sm">
      <h2 className="text-pequeno font-medium text-cinza-texto">{label}</h2>
      <p className="mt-2 font-titulo text-h2 font-bold">{value}</p>
    </section>
  );
}

function ChartCard({
  title,
  empty,
  children,
}: {
  title: string;
  empty: boolean;
  children: ReactNode;
}) {
  return (
    <Card title={title}>
      {empty ? (
        <p className="text-cinza-texto">Sem dados no período.</p>
      ) : (
        <div className="h-72" role="img" aria-label={title}>
          <ResponsiveContainer width="100%" height="100%">
            {children as React.ReactElement}
          </ResponsiveContainer>
        </div>
      )}
    </Card>
  );
}
