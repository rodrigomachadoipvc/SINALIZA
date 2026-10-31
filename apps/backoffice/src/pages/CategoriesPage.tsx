import { CATEGORY_ICONS } from '@sinaliza/shared';
import { Pencil, Plus, Power } from 'lucide-react';
import { useState } from 'react';

import { ApiError, errorMessage } from '../api/client';
import { useCategories, useSaveCategory, useSetCategoryActive } from '../api/queries';
import type { Category } from '../api/types';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card, PageHeader } from '../components/Card';
import { ConfirmDialog, Dialog } from '../components/Dialog';
import { TextField } from '../components/Field';
import { CategoryIcon } from '../components/icons';
import { PageLoading } from '../components/Spinner';
import { useToast } from '../components/Toast';

export function CategoriesPage() {
  const categories = useCategories();
  const [editing, setEditing] = useState<Category | 'new' | null>(null);
  const [toggling, setToggling] = useState<Category | null>(null);

  return (
    <>
      <PageHeader title="Categorias">
        <Button icon={<Plus size={20} aria-hidden="true" />} onClick={() => setEditing('new')}>
          Nova categoria
        </Button>
      </PageHeader>
      <Card>
        {categories.isError ? <Alert kind="error">{errorMessage(categories.error)}</Alert> : null}
        {categories.isPending ? <PageLoading /> : null}
        {categories.data ? (
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b-2 border-cinza-divisoria text-pequeno">
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Categoria
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Identificador
                </th>
                <th scope="col" className="py-2 pr-4 font-semibold">
                  Estado
                </th>
                <th scope="col" className="py-2 text-right font-semibold">
                  Ações
                </th>
              </tr>
            </thead>
            <tbody>
              {categories.data.map((c) => (
                <tr key={c.id} className="border-b border-cinza-divisoria">
                  <td className="py-3 pr-4">
                    <span className="flex items-center gap-3 font-medium">
                      <span className="flex size-10 items-center justify-center rounded-full bg-cinza-claro">
                        <CategoryIcon name={c.icon} />
                      </span>
                      {c.name}
                    </span>
                  </td>
                  <td className="py-3 pr-4 text-cinza-texto">{c.slug}</td>
                  <td className="py-3 pr-4">
                    <ActiveLabel active={c.active} />
                  </td>
                  <td className="py-3">
                    <div className="flex justify-end gap-2">
                      <Button
                        variant="secondary"
                        icon={<Pencil size={18} aria-hidden="true" />}
                        onClick={() => setEditing(c)}
                        aria-label={`Editar ${c.name}`}
                      >
                        Editar
                      </Button>
                      <Button
                        variant={c.active ? 'destructive' : 'secondary'}
                        icon={<Power size={18} aria-hidden="true" />}
                        onClick={() => setToggling(c)}
                        aria-label={`${c.active ? 'Desativar' : 'Ativar'} ${c.name}`}
                      >
                        {c.active ? 'Desativar' : 'Ativar'}
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : null}
      </Card>

      {editing ? (
        <CategoryForm
          category={editing === 'new' ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
      {toggling ? <ToggleCategory category={toggling} onClose={() => setToggling(null)} /> : null}
    </>
  );
}

export function ActiveLabel({ active }: { active: boolean }) {
  return (
    <span
      className={`inline-flex items-center gap-2 text-pequeno font-medium ${active ? 'text-sucesso' : 'text-cinza-texto'}`}
    >
      <span
        className={`size-2.5 rounded-full ${active ? 'bg-sucesso' : 'bg-cinza-contorno'}`}
        aria-hidden="true"
      />
      {active ? 'Ativa' : 'Inativa'}
    </span>
  );
}

function CategoryForm({ category, onClose }: { category: Category | null; onClose: () => void }) {
  const save = useSaveCategory();
  const toast = useToast();
  const [name, setName] = useState(category?.name ?? '');
  const [icon, setIcon] = useState(category?.icon ?? '');
  const [touched, setTouched] = useState(false);
  const trimmed = name.trim();
  const nameError =
    trimmed.length < 2 || trimmed.length > 80
      ? 'O nome deve ter entre 2 e 80 caracteres.'
      : save.error instanceof ApiError && save.error.status === 409
        ? save.error.message
        : undefined;
  const iconError = icon ? undefined : 'Escolha um ícone.';

  const submit = () => {
    setTouched(true);
    if (trimmed.length < 2 || trimmed.length > 80 || iconError) return;
    save.mutate(
      { ...(category ? { id: category.id } : {}), name: trimmed, icon },
      {
        onSuccess: (saved) => {
          toast.success(
            category
              ? `Categoria «${saved.name}» atualizada.`
              : `Categoria «${saved.name}» criada.`,
          );
          onClose();
        },
      },
    );
  };

  return (
    <Dialog
      open
      wide
      title={category ? `Editar ${category.name}` : 'Nova categoria'}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={save.isPending}>
            Cancelar
          </Button>
          <Button onClick={submit} loading={save.isPending}>
            {category ? 'Guardar' : 'Criar categoria'}
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        {save.isError && !(save.error instanceof ApiError && save.error.status === 409) ? (
          <Alert kind="error">{errorMessage(save.error)}</Alert>
        ) : null}
        <TextField
          label="Nome"
          value={name}
          maxLength={80}
          onChange={(e) => setName(e.target.value)}
          onBlur={() => setTouched(true)}
          error={touched || save.isError ? nameError : undefined}
        />
        <fieldset>
          <legend className="mb-2 text-pequeno font-medium">Ícone</legend>
          <div className="grid grid-cols-8 gap-2" role="radiogroup">
            {CATEGORY_ICONS.map((name) => (
              <label
                key={name}
                title={name}
                className={`flex size-14 cursor-pointer items-center justify-center rounded-campo border-2 has-[:focus-visible]:outline-3 has-[:focus-visible]:outline-amarelo ${
                  icon === name
                    ? 'border-azul bg-superficie-info'
                    : 'border-cinza-divisoria hover:bg-cinza-claro'
                }`}
              >
                <input
                  type="radio"
                  name="icon"
                  value={name}
                  checked={icon === name}
                  onChange={() => setIcon(name)}
                  className="sr-only"
                  aria-label={name}
                />
                <CategoryIcon name={name} size={24} />
              </label>
            ))}
          </div>
          {touched && iconError ? <p className="mt-1 text-pequeno text-erro">{iconError}</p> : null}
        </fieldset>
      </div>
    </Dialog>
  );
}

function ToggleCategory({ category, onClose }: { category: Category; onClose: () => void }) {
  const mutation = useSetCategoryActive();
  const toast = useToast();
  const activate = !category.active;
  return (
    <ConfirmDialog
      open
      title={activate ? `Ativar ${category.name}` : `Desativar ${category.name}`}
      message={
        <>
          {activate
            ? 'A categoria volta a estar disponível para os cidadãos.'
            : 'Os cidadãos deixam de poder escolher esta categoria. As ocorrências existentes mantêm-na.'}
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
          { id: category.id, active: activate },
          {
            onSuccess: () => {
              toast.success(`Categoria «${category.name}» ${activate ? 'ativada' : 'desativada'}.`);
              onClose();
            },
          },
        )
      }
    />
  );
}
