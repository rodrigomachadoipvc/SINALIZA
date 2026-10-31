import { zodResolver } from '@hookform/resolvers/zod';
import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { z } from 'zod';

import { ApiError, errorMessage } from '../api/client';
import { useChangePassword, useMe, useUpdateMe } from '../api/queries';
import { sessionStore } from '../auth/session-store';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { Card, PageHeader } from '../components/Card';
import { TextField } from '../components/Field';
import { PageLoading } from '../components/Spinner';
import { useToast } from '../components/Toast';
import { ROLE_LABELS } from '../layout/AppLayout';
import { formatDate } from '../lib/format';
import { nameSchema, phoneSchema } from './ManagersPage';
import { newPasswordSchema } from './PasswordPages';

const detailsSchema = z.object({ name: nameSchema, phone: phoneSchema });

const passwordSchema = newPasswordSchema.and(
  z.object({ currentPassword: z.string().min(1, 'Indique a palavra-passe atual.') }),
);

export function ProfilePage() {
  const me = useMe();
  if (me.isPending) return <PageLoading />;
  if (me.isError) return <Alert kind="error">{errorMessage(me.error)}</Alert>;
  const user = me.data;
  return (
    <>
      <PageHeader title="Perfil" />
      <div className="grid grid-cols-2 gap-6">
        <Card title="Os seus dados">
          <p className="mb-4 text-pequeno text-cinza-texto">
            {ROLE_LABELS[user.role]} · conta criada a {formatDate(user.createdAt)}
          </p>
          <DetailsForm name={user.name} phone={user.phone} email={user.email} />
        </Card>
        <Card title="Alterar palavra-passe">
          <PasswordForm />
        </Card>
      </div>
    </>
  );
}

function DetailsForm({
  name,
  phone,
  email,
}: {
  name: string;
  phone: string | null;
  email: string;
}) {
  const mutation = useUpdateMe();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors, isDirty },
  } = useForm<z.infer<typeof detailsSchema>>({
    resolver: zodResolver(detailsSchema),
    defaultValues: { name, phone: phone ?? '' },
  });

  useEffect(() => reset({ name, phone: phone ?? '' }), [name, phone, reset]);

  const onSubmit = handleSubmit((values) => {
    mutation.mutate(
      { name: values.name, phone: values.phone || null },
      {
        onSuccess: (user) => {
          // The top bar shows the name from the session, so keep it in step.
          sessionStore.updateUser(user);
          toast.success('Dados atualizados.');
        },
      },
    );
  });

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {mutation.isError ? <Alert kind="error">{errorMessage(mutation.error)}</Alert> : null}
      <TextField
        label="Nome"
        autoComplete="name"
        error={errors.name?.message}
        {...register('name')}
      />
      <TextField
        label="Email"
        value={email}
        disabled
        readOnly
        hint="O email não pode ser alterado."
      />
      <TextField
        label="Telemóvel (opcional)"
        type="tel"
        autoComplete="tel"
        error={errors.phone?.message}
        {...register('phone')}
      />
      <Button type="submit" loading={mutation.isPending} disabled={!isDirty} className="self-start">
        Guardar alterações
      </Button>
    </form>
  );
}

function PasswordForm() {
  const mutation = useChangePassword();
  const toast = useToast();
  const {
    register,
    handleSubmit,
    reset,
    setError,
    formState: { errors },
  } = useForm<z.infer<typeof passwordSchema>>({ resolver: zodResolver(passwordSchema) });

  const onSubmit = handleSubmit(({ currentPassword, newPassword }) => {
    mutation.mutate(
      { currentPassword, newPassword },
      {
        onSuccess: () => {
          reset({ currentPassword: '', newPassword: '', confirm: '' });
          toast.success('Palavra-passe alterada.');
        },
        onError: (e) => {
          const field = e instanceof ApiError ? e.fieldErrors() : {};
          if (field.currentPassword)
            setError('currentPassword', { message: field.currentPassword });
          if (field.newPassword) setError('newPassword', { message: field.newPassword });
        },
      },
    );
  });

  const fieldErrors = mutation.error instanceof ApiError ? mutation.error.fieldErrors() : {};
  const showGeneral = mutation.isError && !fieldErrors.currentPassword && !fieldErrors.newPassword;

  return (
    <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
      {showGeneral ? <Alert kind="error">{errorMessage(mutation.error)}</Alert> : null}
      <TextField
        label="Palavra-passe atual"
        type="password"
        autoComplete="current-password"
        error={errors.currentPassword?.message}
        {...register('currentPassword')}
      />
      <TextField
        label="Nova palavra-passe"
        type="password"
        autoComplete="new-password"
        hint="Mínimo 8 caracteres, com letras e números."
        error={errors.newPassword?.message}
        {...register('newPassword')}
      />
      <TextField
        label="Confirmar nova palavra-passe"
        type="password"
        autoComplete="new-password"
        error={errors.confirm?.message}
        {...register('confirm')}
      />
      <Button type="submit" loading={mutation.isPending} className="self-start">
        Alterar palavra-passe
      </Button>
    </form>
  );
}
