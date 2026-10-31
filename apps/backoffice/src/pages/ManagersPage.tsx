import { zodResolver } from '@hookform/resolvers/zod';
import { Copy, Pencil, Plus, Power, Search } from 'lucide-react';
import { type FormEvent, useState } from 'react';
import { useForm } from 'react-hook-form';
import { useSearchParams } from 'react-router';
import { z } from 'zod';

import { ApiError, errorMessage } from '../api/client';
import {
  useCreateManager,
  useManagers,
  useSetManagerActive,
  useUpdateManager,
} from '../api/queries';
import type { User } from '../api/types';
import { useAuth } from '../auth/auth';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card, PageHeader } from '../components/Card';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { TextField } from '../components/Field';
import { Pagination } from '../components/Pagination';
import { PageLoading } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { formatDate, formatDateTime } from '../lib/format';

const PHONE_PATTERN = /^\+?[0-9 ]{9,20}$/;

export const nameSchema = z
  .string()
  .trim()
  .min(2, 'O nome deve ter entre 2 e 120 caracteres.')
  .max(120, 'O nome deve ter entre 2 e 120 caracteres.');

export const phoneSchema = z
  .string()
  .trim()
  .refine(
    (v) => v === '' || PHONE_PATTERN.test(v),
    'Indique um telemóvel válido (só algarismos, espaços e o prefixo +).',
  );

export function ManagersPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get('q') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const [search, setSearch] = useState(q);
  const managers = useManagers({ ...(q ? { q } : {}), page });
  const [dialog, setDialog] = useState<
    { kind: 'create' } | { kind: 'edit' | 'toggle'; user: User } | null
  >(null);

  const onSearch = (event: FormEvent) => {
    event.preventDefault();
    setParams(search.trim() ? { q: search.trim() } : {});
  };

  return (
    <>
      <PageHeader title="Gestores municipais">
        <Button
          icon={<Plus size={20} aria-hidden="true" />}
          onClick={() => setDialog({ kind: 'create' })}
        >
          Novo gestor
        </Button>
      </PageHeader>
      <Card>
        <form onSubmit={onSearch} className="mb-4 flex items-end gap-3" role="search">
          <div className="flex-1">
            <TextField
              label="Pesquisar"
              placeholder="Nome ou email"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
          <Button type="submit" variant="secondary" icon={<Search size={20} aria-hidden="true" />}>
            Pesquisar
          </Button>
        </form>

        {managers.isError ? <Alert kind="error">{errorMessage(managers.error)}</Alert> : null}
        {managers.isPending ? <PageLoading /> : null}
        {managers.data ? (
          <>
            <table className="w-full border-collapse text-left">
              <thead>
                <tr className="border-b-2 border-cinza-divisoria text-pequeno">
                  {['Nome', 'Email', 'Telemóvel', 'Último acesso', 'Estado'].map((h) => (
                    <th key={h} scope="col" className="py-2 pr-4 font-semibold">
                      {h}
                    </th>
                  ))}
                  <th scope="col" className="py-2 text-right font-semibold">
                    Ações
                  </th>
                </tr>
              </thead>
              <tbody>
                {managers.data.items.map((u) => (
                  <tr key={u.id} className="border-b border-cinza-divisoria">
                    <td className="py-3 pr-4 font-medium">{u.name}</td>
                    <td className="py-3 pr-4">{u.email}</td>
                    <td className="py-3 pr-4">{u.phone ?? '—'}</td>
                    <td className="py-3 pr-4 text-cinza-texto">
                      {u.lastLoginAt ? formatDateTime(u.lastLoginAt) : 'Nunca'}
                    </td>
                    <td className="py-3 pr-4">
                      <span
                        className={`inline-flex items-center gap-2 text-pequeno font-medium ${u.active ? 'text-sucesso' : 'text-cinza-texto'}`}
                      >
                        <span
                          className={`size-2.5 rounded-full ${u.active ? 'bg-sucesso' : 'bg-cinza-contorno'}`}
                          aria-hidden="true"
                        />
                        {u.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="py-3">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="secondary"
                          icon={<Pencil size={18} aria-hidden="true" />}
                          onClick={() => setDialog({ kind: 'edit', user: u })}
                          aria-label={`Editar ${u.name}`}
                        >
                          Editar
                        </Button>
                        <Button
                          variant={u.active ? 'destructive' : 'secondary'}
                          icon={<Power size={18} aria-hidden="true" />}
                          onClick={() => setDialog({ kind: 'toggle', user: u })}
                          aria-label={`${u.active ? 'Desativar' : 'Ativar'} ${u.name}`}
                        >
                          {u.active ? 'Desativar' : 'Ativar'}
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {managers.data.items.length === 0 ? (
              <p className="py-8 text-center text-cinza-texto">Nenhum gestor encontrado.</p>
            ) : null}
            <Pagination
              page={managers.data.page}
              pageSize={managers.data.pageSize}
              total={managers.data.total}
              onPage={(p) => {
                const next = new URLSearchParams(params);
                if (p > 1) next.set('page', String(p));
                else next.delete('page');
                setParams(next);
              }}
            />
          </>
        ) : null}
      </Card>

      {dialog?.kind === 'create' ? <CreateManager onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'edit' ? (
        <EditManager user={dialog.user} onClose={() => setDialog(null)} />
      ) : null}
      {dialog?.kind === 'toggle' ? (
        <ToggleManager user={dialog.user} onClose={() => setDialog(null)} />
      ) : null}
    </>
  );
}

const createSchema = z.object({
  name: nameSchema,
  email: z.email('Indique um email válido.').max(254, 'O email é demasiado longo.'),
});

function CreateManager({ onClose }: { onClose: () => void }) {
  const mutation = useCreateManager();
  const [created, setCreated] = useState<{ user: User; temporaryPassword: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const {
    register,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof createSchema>>({ resolver: zodResolver(createSchema) });

  const onSubmit = handleSubmit((values) => {
    mutation.mutate(
      { name: values.name, email: values.email.trim().toLowerCase() },
      {
        onSuccess: setCreated,
        onError: (e) => {
          if (e instanceof ApiError && e.status === 409) setError('email', { message: e.message });
        },
      },
    );
  });

  if (created) {
    const copy = async () => {
      await navigator.clipboard.writeText(created.temporaryPassword);
      setCopied(true);
    };
    return (
      <Dialog
        open
        title="Gestor criado"
        onClose={onClose}
        footer={<Button onClick={onClose}>Concluído</Button>}
      >
        <div className="flex flex-col gap-4">
          <Alert kind="success">
            A conta de {created.user.name} ({created.user.email}) foi criada.
          </Alert>
          <div>
            <p className="text-pequeno font-medium">Palavra-passe temporária</p>
            <div className="mt-1 flex items-center gap-3">
              <code className="flex-1 rounded-campo bg-cinza-claro px-3 py-3 font-mono text-h3 tracking-wider">
                {created.temporaryPassword}
              </code>
              <Button
                variant="secondary"
                icon={<Copy size={18} aria-hidden="true" />}
                onClick={() => void copy()}
                data-autofocus
              >
                {copied ? 'Copiada' : 'Copiar'}
              </Button>
            </div>
          </div>
          <Alert kind="warning">
            Esta palavra-passe só é mostrada agora. Entregue-a ao gestor por um canal seguro; ele
            deve alterá-la no Perfil depois do primeiro acesso.
          </Alert>
        </div>
      </Dialog>
    );
  }

  const otherError =
    mutation.isError && !(mutation.error instanceof ApiError && mutation.error.status === 409);

  return (
    <Dialog
      open
      title="Novo gestor"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="create-manager" loading={mutation.isPending}>
            Criar gestor
          </Button>
        </>
      }
    >
      <form id="create-manager" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {otherError ? <Alert kind="error">{errorMessage(mutation.error)}</Alert> : null}
        <TextField
          label="Nome"
          autoComplete="off"
          error={errors.name?.message}
          {...register('name')}
        />
        <TextField
          label="Email"
          type="email"
          autoComplete="off"
          error={errors.email?.message}
          {...register('email')}
        />
        <p className="text-pequeno text-cinza-texto">
          É gerada uma palavra-passe temporária, mostrada uma única vez.
        </p>
      </form>
    </Dialog>
  );
}

const editSchema = z.object({ name: nameSchema, phone: phoneSchema });

function EditManager({ user, onClose }: { user: User; onClose: () => void }) {
  const mutation = useUpdateManager();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<z.infer<typeof editSchema>>({
    resolver: zodResolver(editSchema),
    defaultValues: { name: user.name, phone: user.phone ?? '' },
  });

  const onSubmit = handleSubmit((values) => {
    mutation.mutate(
      { id: user.id, name: values.name, phone: values.phone || null },
      {
        onSuccess: (saved) => {
          toast.success(`Dados de ${saved.name} atualizados.`);
          onClose();
        },
      },
    );
  });

  return (
    <Dialog
      open
      title={`Editar ${user.name}`}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={mutation.isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="edit-manager" loading={mutation.isPending}>
            Guardar
          </Button>
        </>
      }
    >
      <form id="edit-manager" onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {mutation.isError ? <Alert kind="error">{errorMessage(mutation.error)}</Alert> : null}
        <TextField label="Nome" error={errors.name?.message} {...register('name')} />
        <TextField label="Email" value={user.email} disabled readOnly />
        <TextField
          label="Telemóvel (opcional)"
          type="tel"
          error={errors.phone?.message}
          {...register('phone')}
        />
        <p className="text-legenda text-cinza-texto">
          Conta criada a {formatDate(user.createdAt)}.
        </p>
      </form>
    </Dialog>
  );
}

function ToggleManager({ user, onClose }: { user: User; onClose: () => void }) {
  const mutation = useSetManagerActive();
  const toast = useToast();
  const { user: me } = useAuth();
  const activate = !user.active;
  return (
    <ConfirmDialog
      open
      title={activate ? `Ativar ${user.name}` : `Desativar ${user.name}`}
      message={
        <>
          {activate
            ? 'O gestor volta a poder iniciar sessão no backoffice.'
            : 'O gestor deixa de poder iniciar sessão e as sessões abertas terminam.'}
          {me?.id === user.id ? ' Esta é a sua própria conta.' : null}
          {mutation.isError ? (
            <div className="mt-4">
              <Alert kind="error">{errorMessage(mutation.error)}</Alert>
            </div>
          ) : null}
        </>
      }
      confirmLabel={activate ? 'Ativar' : 'Desativar'}
      destructive={!activate}
      loading={mutation.isPending}
      onClose={onClose}
      onConfirm={() =>
        mutation.mutate(
          { id: user.id, active: activate },
          {
            onSuccess: () => {
              toast.success(`${user.name} ${activate ? 'ativado' : 'desativado'}.`);
              onClose();
            },
          },
        )
      }
    />
  );
}
