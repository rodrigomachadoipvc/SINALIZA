import {
  MIN_REASON_LENGTH,
  OCCURRENCE_STATUSES,
  OccurrenceStatus,
  OPEN_STATUSES,
  STATUS_LABELS,
} from '@sinaliza/shared';
import {
  ArrowLeft,
  CircleCheck,
  Copy,
  Flag,
  FolderTree,
  type LucideIcon,
  Search,
  X,
  ZoomIn,
} from 'lucide-react';
import { useState } from 'react';
import { Marker } from 'react-leaflet';
import { Link, useParams } from 'react-router';

import { ApiError, errorMessage } from '../api/client';
import {
  useCategories,
  useChangeCategory,
  useChangeStatus,
  useMarkDuplicate,
  useOccurrence,
  useOccurrences,
} from '../api/queries';
import type { HistoryEntry, OccurrenceDetail, StaffRow } from '../api/types';
import { Alert } from '../components/Alert';
import { Button, type ButtonVariant } from '../components/Button';
import { Card } from '../components/Card';
import { Dialog } from '../components/Dialog';
import { SelectField, TextArea, TextField } from '../components/Field';
import { PageLoading } from '../components/Spinner';
import { StatusBadge } from '../components/StatusBadge';
import { useToast } from '../components/Toast';
import { formatDate, formatDateTime } from '../lib/format';
import { ROLE_LABELS } from '../layout/AppLayout';
import { BaseMap, pinIcon } from '../map/BaseMap';

const S = OccurrenceStatus;
const NOTE_MAX = 1000;

/** The status actions, in the order they are shown; only the allowed ones appear. */
interface StatusAction {
  to: OccurrenceStatus;
  label: string;
  icon: LucideIcon;
  variant: ButtonVariant;
  title: string;
  confirm: string;
  /** reason = rejection (required, ≥ 10 chars); note = optional note; none = plain confirmation. */
  field: 'reason' | 'note' | 'none';
  message: string;
}

export const STATUS_ACTIONS: StatusAction[] = [
  {
    to: S.EM_ANALISE,
    label: 'Validar',
    icon: CircleCheck,
    variant: 'primary',
    title: 'Validar ocorrência',
    confirm: 'Validar',
    field: 'none',
    message: 'A ocorrência passa a «Em Análise» e o cidadão recebe um email.',
  },
  {
    to: S.EM_RESOLUCAO,
    label: 'Iniciar resolução',
    icon: Flag,
    variant: 'primary',
    title: 'Iniciar resolução',
    confirm: 'Iniciar resolução',
    field: 'note',
    message: 'A ocorrência passa a «Em Resolução» e o cidadão recebe um email.',
  },
  {
    to: S.RESOLVIDA,
    label: 'Marcar como resolvida',
    icon: CircleCheck,
    variant: 'primary',
    title: 'Marcar como resolvida',
    confirm: 'Marcar como resolvida',
    field: 'note',
    message: 'Esta ação não pode ser desfeita. O cidadão recebe um email.',
  },
  {
    to: S.REJEITADA,
    label: 'Rejeitar',
    icon: X,
    variant: 'destructive',
    title: 'Rejeitar ocorrência',
    confirm: 'Rejeitar',
    field: 'reason',
    message: 'Esta ação não pode ser desfeita. O cidadão recebe a fundamentação por email.',
  },
];

/** Normal path, used to show the steps still to come. */
const MAIN_PATH: OccurrenceStatus[] = [S.RECEBIDA, S.EM_ANALISE, S.EM_RESOLUCAO, S.RESOLVIDA];

export function OccurrenceDetailPage() {
  const { id = '' } = useParams();
  const occurrence = useOccurrence(id);
  const [action, setAction] = useState<StatusAction | null>(null);
  const [dialog, setDialog] = useState<'duplicate' | 'category' | 'photo' | null>(null);

  if (occurrence.isPending) return <PageLoading />;
  if (occurrence.isError) {
    const notFound = occurrence.error instanceof ApiError && occurrence.error.status === 404;
    return (
      <div className="flex flex-col items-start gap-4">
        <Alert kind="error">
          {notFound ? 'A ocorrência não existe.' : errorMessage(occurrence.error)}
        </Alert>
        <BackLink />
      </div>
    );
  }
  const o = occurrence.data;
  const actions = STATUS_ACTIONS.filter((a) => o.allowedTransitions.includes(a.to));
  const canDuplicate = o.allowedTransitions.includes(S.DUPLICADA);
  const canChangeCategory = o.status !== S.ANULADA;

  return (
    <>
      <BackLink />
      <div className="mt-2 mb-6 flex flex-wrap items-center gap-4">
        <h1>{o.reference}</h1>
        <StatusBadge status={o.status} />
      </div>

      <div className="grid grid-cols-12 gap-6">
        <div className="col-span-12 flex flex-col gap-6 xl:col-span-7">
          <Card title="Dados da ocorrência">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-4">
              <Info label="Categoria">{o.category.name}</Info>
              <Info label="Data">{formatDateTime(o.createdAt)}</Info>
              <Info label="Morada">{o.address}</Info>
              <Info label="Coordenadas">
                {o.lat.toFixed(5)}, {o.lng.toFixed(5)}
              </Info>
              {o.citizen ? (
                <Info label="Cidadão">
                  {o.citizen.name}
                  <br />
                  <span className="text-cinza-texto">{o.citizen.email}</span>
                </Info>
              ) : null}
              {o.resolvedAt ? (
                <Info label="Resolvida em">{formatDateTime(o.resolvedAt)}</Info>
              ) : null}
              {o.original ? (
                <Info label="Duplicada de">
                  <Link to={`/ocorrencias/${o.original.id}`} className="font-semibold underline">
                    {o.original.reference}
                  </Link>
                </Info>
              ) : null}
              <div className="col-span-2">
                <Info label="Descrição">
                  <span className="whitespace-pre-line">{o.description}</span>
                </Info>
              </div>
              {o.rejectionReason ? (
                <div className="col-span-2">
                  <Alert kind="error" title="Fundamentação da rejeição">
                    {o.rejectionReason}
                  </Alert>
                </div>
              ) : null}
            </dl>
          </Card>

          <Card title="Fotografia">
            {o.photoUrl ? (
              <button
                type="button"
                onClick={() => setDialog('photo')}
                className="group relative block overflow-hidden rounded-campo"
                aria-label="Ampliar fotografia"
              >
                <img
                  src={o.photoUrl}
                  alt={`Fotografia da ocorrência ${o.reference}`}
                  className="max-h-96 w-full object-cover"
                />
                <span className="absolute right-3 bottom-3 flex items-center gap-1 rounded-full bg-azul px-3 py-1 text-pequeno text-branco">
                  <ZoomIn size={16} aria-hidden="true" /> Ampliar
                </span>
              </button>
            ) : (
              <p className="text-cinza-texto">O cidadão não enviou fotografia.</p>
            )}
          </Card>
        </div>

        <div className="col-span-12 flex flex-col gap-6 xl:col-span-5">
          <Card title="Ações">
            {actions.length === 0 && !canDuplicate && !canChangeCategory ? (
              <p className="text-cinza-texto">Esta ocorrência já não pode ser alterada.</p>
            ) : (
              <div className="flex flex-wrap gap-3">
                {actions.map((a) => (
                  <Button
                    key={a.to}
                    variant={a.variant}
                    icon={<a.icon size={20} aria-hidden="true" />}
                    onClick={() => setAction(a)}
                  >
                    {a.label}
                  </Button>
                ))}
                {canDuplicate ? (
                  <Button
                    variant="secondary"
                    icon={<Copy size={20} aria-hidden="true" />}
                    onClick={() => setDialog('duplicate')}
                  >
                    Marcar como duplicada
                  </Button>
                ) : null}
                {canChangeCategory ? (
                  <Button
                    variant="secondary"
                    icon={<FolderTree size={20} aria-hidden="true" />}
                    onClick={() => setDialog('category')}
                  >
                    Alterar categoria
                  </Button>
                ) : null}
              </div>
            )}
          </Card>

          <Card title="Localização">
            <BaseMap
              label={`Mapa com a localização de ${o.reference}`}
              center={[o.lat, o.lng]}
              zoom={16}
              className="h-72"
            >
              <Marker position={[o.lat, o.lng]} icon={pinIcon(o.status)} />
            </BaseMap>
          </Card>

          <Card title="Histórico">
            <History occurrence={o} />
          </Card>
        </div>
      </div>

      {action ? (
        <StatusDialog occurrence={o} action={action} onClose={() => setAction(null)} />
      ) : null}
      {dialog === 'duplicate' ? (
        <DuplicateDialog occurrence={o} onClose={() => setDialog(null)} />
      ) : null}
      {dialog === 'category' ? (
        <CategoryDialog occurrence={o} onClose={() => setDialog(null)} />
      ) : null}
      <Dialog
        open={dialog === 'photo'}
        title={`Fotografia de ${o.reference}`}
        onClose={() => setDialog(null)}
        wide
      >
        {o.photoUrl ? (
          <img
            src={o.photoUrl}
            alt={`Fotografia da ocorrência ${o.reference}, ampliada`}
            className="w-full rounded-campo"
          />
        ) : null}
      </Dialog>
    </>
  );
}

function BackLink() {
  return (
    <Link
      to="/ocorrencias"
      className="inline-flex min-h-12 items-center gap-2 font-medium underline-offset-4 hover:underline"
    >
      <ArrowLeft size={20} aria-hidden="true" /> Voltar às ocorrências
    </Link>
  );
}

function Info({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-pequeno font-medium text-cinza-texto">{label}</dt>
      <dd className="mt-1">{children}</dd>
    </div>
  );
}

// ------------------------------------------------------------------ history

function History({ occurrence: o }: { occurrence: OccurrenceDetail }) {
  const pending = OPEN_STATUSES.includes(o.status)
    ? MAIN_PATH.slice(MAIN_PATH.indexOf(o.status) + 1)
    : [];
  return (
    <ol className="flex flex-col">
      {o.history.map((entry, i) => (
        <HistoryItem
          key={`${entry.to}-${entry.changedAt}`}
          entry={entry}
          state={i === o.history.length - 1 ? 'current' : 'done'}
        />
      ))}
      {pending.map((status) => (
        <li key={status} className="flex gap-3 pb-4">
          <span
            className="mt-1 size-4 shrink-0 rounded-full border-2 border-cinza-contorno bg-branco"
            aria-hidden="true"
          />
          <p className="text-cinza-texto">
            {STATUS_LABELS[status]} <span className="text-legenda">(pendente)</span>
          </p>
        </li>
      ))}
    </ol>
  );
}

function HistoryItem({ entry, state }: { entry: HistoryEntry; state: 'done' | 'current' }) {
  return (
    <li className="flex gap-3 pb-4" aria-current={state === 'current' ? 'step' : undefined}>
      <span
        className={`mt-1 size-4 shrink-0 rounded-full ${state === 'current' ? 'bg-amarelo ring-2 ring-azul' : 'bg-azul'}`}
        aria-hidden="true"
      />
      <div>
        <p className="font-semibold">
          {STATUS_LABELS[entry.to]}
          {state === 'current' ? <span className="sr-only"> (estado atual)</span> : null}
        </p>
        <p className="text-pequeno text-cinza-texto">
          {formatDateTime(entry.changedAt)} · {ROLE_LABELS[entry.changedByRole]}
        </p>
        {entry.reason ? <p className="mt-1 text-pequeno">Fundamentação: {entry.reason}</p> : null}
        {entry.note ? <p className="mt-1 text-pequeno">{entry.note}</p> : null}
      </div>
    </li>
  );
}

// ------------------------------------------------------------------ dialogs

export function StatusDialog({
  occurrence,
  action,
  onClose,
}: {
  occurrence: OccurrenceDetail;
  action: StatusAction;
  onClose: () => void;
}) {
  const mutation = useChangeStatus(occurrence.id);
  const toast = useToast();
  const [text, setText] = useState('');
  const [touched, setTouched] = useState(false);
  const reasonError =
    action.field === 'reason' && text.trim().length < MIN_REASON_LENGTH
      ? `Indique a fundamentação (pelo menos ${MIN_REASON_LENGTH} caracteres).`
      : undefined;

  const submit = () => {
    setTouched(true);
    if (reasonError) return;
    const value = text.trim();
    mutation.mutate(
      {
        status: action.to,
        ...(action.field === 'reason' ? { reason: value } : {}),
        ...(action.field === 'note' && value ? { note: value } : {}),
      },
      {
        onSuccess: () => {
          toast.success(
            `${occurrence.reference}: estado alterado para «${STATUS_LABELS[action.to]}».`,
          );
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open
      title={action.title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            variant={action.variant}
            onClick={submit}
            loading={mutation.isPending}
            data-autofocus={action.field === 'none' || undefined}
          >
            {action.confirm}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-cinza-texto">{action.message}</p>
        {mutation.isError ? <Alert kind="error">{errorMessage(mutation.error)}</Alert> : null}
        {action.field === 'none' ? null : (
          <TextArea
            label={action.field === 'reason' ? 'Fundamentação (obrigatória)' : 'Nota (opcional)'}
            value={text}
            length={text.length}
            maxLength={NOTE_MAX}
            onChange={(e) => setText(e.target.value)}
            onBlur={() => setTouched(true)}
            error={touched ? reasonError : undefined}
          />
        )}
      </div>
    </Dialog>
  );
}

const ORIGINAL_STATUSES = OCCURRENCE_STATUSES.filter((s) => s !== S.DUPLICADA && s !== S.ANULADA);

function DuplicateDialog({
  occurrence,
  onClose,
}: {
  occurrence: OccurrenceDetail;
  onClose: () => void;
}) {
  const mutation = useMarkDuplicate(occurrence.id);
  const toast = useToast();
  const [input, setInput] = useState('');
  const [query, setQuery] = useState('');
  const [selected, setSelected] = useState<StaffRow | null>(null);
  const results = useOccurrences({
    q: query,
    status: ORIGINAL_STATUSES.join(','),
    category: query ? undefined : occurrence.category.slug,
    pageSize: 8,
  });
  const candidates = (results.data?.items ?? []).filter((r) => r.id !== occurrence.id);

  const submit = () => {
    if (!selected) return;
    mutation.mutate(
      { originalId: selected.id },
      {
        onSuccess: () => {
          toast.success(`${occurrence.reference} marcada como duplicada de ${selected.reference}.`);
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open
      wide
      title="Marcar como duplicada"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={!selected} loading={mutation.isPending}>
            Marcar como duplicada
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <p className="text-cinza-texto">
          Escolha a ocorrência original. Esta ação não pode ser desfeita; o cidadão recebe um email
          com a referência da original.
        </p>
        {mutation.isError ? <Alert kind="error">{errorMessage(mutation.error)}</Alert> : null}
        <form
          role="search"
          className="flex items-end gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            setQuery(input.trim());
          }}
        >
          <div className="flex-1">
            <TextField
              label="Pesquisar a original"
              placeholder="Referência, morada ou descrição"
              value={input}
              onChange={(e) => setInput(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" icon={<Search size={20} aria-hidden="true" />}>
            Pesquisar
          </Button>
        </form>
        {!query ? (
          <p className="text-pequeno text-cinza-texto">
            Sugestões da mesma categoria ({occurrence.category.name}):
          </p>
        ) : null}
        <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto" aria-label="Resultados">
          {candidates.map((c) => (
            <li key={c.id}>
              <label
                className={`flex min-h-12 cursor-pointer items-center gap-3 rounded-campo border-2 px-3 py-2 ${
                  selected?.id === c.id
                    ? 'border-azul bg-superficie-info'
                    : 'border-cinza-divisoria'
                }`}
              >
                <input
                  type="radio"
                  name="original"
                  aria-label={`${c.reference}, ${c.category.name}, ${c.address}`}
                  className="size-5"
                  checked={selected?.id === c.id}
                  onChange={() => setSelected(c)}
                />
                <span className="font-semibold">{c.reference}</span>
                <span className="flex-1 text-pequeno text-cinza-texto">
                  {c.category.name} · {c.address}
                </span>
                <StatusBadge status={c.status} />
              </label>
            </li>
          ))}
        </ul>
        {results.isSuccess && candidates.length === 0 ? (
          <p className="text-cinza-texto">Nenhuma ocorrência encontrada.</p>
        ) : null}
        {selected ? (
          <div className="rounded-cartao bg-cinza-claro p-4" aria-live="polite">
            <p className="text-pequeno font-medium text-cinza-texto">
              Pré-visualização da original
            </p>
            <p className="mt-1 font-semibold">
              {selected.reference} · {selected.category.name}
            </p>
            <p className="text-pequeno">{selected.address}</p>
            <p className="mt-2 flex items-center gap-3 text-pequeno text-cinza-texto">
              <StatusBadge status={selected.status} /> Criada a {formatDate(selected.createdAt)}
            </p>
          </div>
        ) : null}
      </div>
    </Dialog>
  );
}

function CategoryDialog({
  occurrence,
  onClose,
}: {
  occurrence: OccurrenceDetail;
  onClose: () => void;
}) {
  const categories = useCategories();
  const mutation = useChangeCategory(occurrence.id);
  const toast = useToast();
  const [categoryId, setCategoryId] = useState(occurrence.category.id);
  const active = (categories.data ?? []).filter((c) => c.active);

  const submit = () => {
    mutation.mutate(categoryId, {
      onSuccess: (detail) => {
        toast.success(
          `Categoria de ${occurrence.reference} alterada para «${detail.category.name}».`,
        );
        onClose();
      },
    });
  };

  return (
    <Dialog
      open
      title="Alterar categoria"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button
            onClick={submit}
            loading={mutation.isPending}
            disabled={categoryId === occurrence.category.id}
          >
            Guardar
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {mutation.isError ? <Alert kind="error">{errorMessage(mutation.error)}</Alert> : null}
        <SelectField
          label="Categoria"
          value={categoryId}
          onChange={(e) => setCategoryId(e.target.value)}
        >
          {active.some((c) => c.id === occurrence.category.id) ? null : (
            <option value={occurrence.category.id}>{occurrence.category.name}</option>
          )}
          {active.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </SelectField>
      </div>
    </Dialog>
  );
}
