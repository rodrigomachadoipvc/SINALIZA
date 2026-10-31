// Only the structural cluster CSS: the default theme's green/orange colours are not in the palette.
import 'react-leaflet-cluster/dist/assets/MarkerCluster.css';

import { OCCURRENCE_STATUSES, type OccurrenceStatus, STATUS_LABELS } from '@sinaliza/shared';
import L, { type MarkerCluster } from 'leaflet';
import { Marker, Popup } from 'react-leaflet';
import MarkerClusterGroup from 'react-leaflet-cluster';
import { Link, useSearchParams } from 'react-router';

import { errorMessage } from '../api/client';
import { useCategories, useMapPins } from '../api/queries';
import { Alert } from '../components/Alert';
import { Card, PageHeader } from '../components/Card';
import { Chip } from '../components/Chip';
import { SelectField } from '../components/Field';
import { StatusBadge } from '../components/StatusBadge';
import { formatDate, formatNumber } from '../lib/format';
import { BaseMap, pinIcon } from '../map/BaseMap';

/** Blue disc with the count, sized by the number of occurrences it groups. */
function clusterIcon(cluster: MarkerCluster): L.DivIcon {
  const count = cluster.getChildCount();
  const size = count < 10 ? 36 : count < 100 ? 44 : 52;
  return L.divIcon({
    html: `<span>${count}</span>`,
    className: 'sinaliza-cluster',
    iconSize: [size, size],
  });
}

/** All occurrences on the map, clustered; filters live in the URL like the list. */
export function MapPage() {
  const [params, setParams] = useSearchParams();
  const statuses = (params.get('status') ?? '').split(',').filter(Boolean) as OccurrenceStatus[];
  const category = params.get('category') ?? '';
  const categories = useCategories();
  const pins = useMapPins({
    ...(statuses.length ? { status: statuses.join(',') } : {}),
    ...(category ? { category } : {}),
  });

  const update = (key: string, value: string) => {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next);
  };

  const toggleStatus = (status: OccurrenceStatus) =>
    update(
      'status',
      (statuses.includes(status)
        ? statuses.filter((s) => s !== status)
        : [...statuses, status]
      ).join(','),
    );

  return (
    <>
      <PageHeader title="Mapa">
        {pins.data ? (
          <p className="text-pequeno text-cinza-texto" aria-live="polite">
            {formatNumber(pins.data.items.length)}{' '}
            {pins.data.items.length === 1 ? 'ocorrência no mapa' : 'ocorrências no mapa'}
          </p>
        ) : null}
      </PageHeader>

      <Card className="mb-6">
        <fieldset>
          <legend className="text-pequeno font-medium">Estado</legend>
          <div className="flex flex-wrap gap-x-2">
            {OCCURRENCE_STATUSES.map((s) => (
              <Chip key={s} selected={statuses.includes(s)} onToggle={() => toggleStatus(s)}>
                {s === 'ANULADA' ? 'Anuladas' : STATUS_LABELS[s]}
              </Chip>
            ))}
          </div>
        </fieldset>
        <div className="mt-2 w-80">
          <SelectField
            label="Categoria"
            value={category}
            onChange={(e) => update('category', e.target.value)}
          >
            <option value="">Todas as categorias</option>
            {categories.data?.map((c) => (
              <option key={c.id} value={c.slug}>
                {c.name}
                {c.active ? '' : ' (inativa)'}
              </option>
            ))}
          </SelectField>
        </div>
      </Card>

      {pins.isError ? <Alert kind="error">{errorMessage(pins.error)}</Alert> : null}
      {pins.data?.truncated ? (
        <div className="mb-4">
          <Alert kind="warning">
            Há demasiadas ocorrências para mostrar todas. Use os filtros para reduzir o número.
          </Alert>
        </div>
      ) : null}

      <BaseMap
        label="Mapa das ocorrências do município"
        className="h-[calc(100vh-22rem)] min-h-[480px]"
      >
        <MarkerClusterGroup chunkedLoading iconCreateFunction={clusterIcon}>
          {pins.data?.items.map((p) => (
            <Marker key={p.id} position={[p.lat, p.lng]} icon={pinIcon(p.status)}>
              <Popup>
                <div className="flex flex-col gap-2 font-sans">
                  <p className="font-semibold">{p.reference}</p>
                  <p>{p.category.name}</p>
                  <StatusBadge status={p.status} />
                  <p className="text-cinza-texto">Criada a {formatDate(p.createdAt)}</p>
                  <Link to={`/ocorrencias/${p.id}`} className="font-semibold underline">
                    Ver detalhe
                  </Link>
                </div>
              </Popup>
            </Marker>
          ))}
        </MarkerClusterGroup>
      </BaseMap>
    </>
  );
}
