import { zodResolver } from '@hookform/resolvers/zod';
import { isValidPassword, PASSWORD_RULE_MESSAGE } from '@sinaliza/shared';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, useSearchParams } from 'react-router';
import { z } from 'zod';

import { api, errorMessage } from '../api/client';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { TextField } from '../components/Field';
import { PublicLayout } from './PublicLayout';

const backToLogin = (
  <Link
    to="/login"
    className="self-center py-3 text-pequeno font-medium text-azul underline underline-offset-4"
  >
    Voltar a iniciar sessão
  </Link>
);

const forgotSchema = z.object({ email: z.email('Indique um email válido.') });

export function ForgotPasswordPage() {
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof forgotSchema>>({ resolver: zodResolver(forgotSchema) });

  const onSubmit = handleSubmit(async ({ email }) => {
    setError(null);
    try {
      await api('POST', '/auth/forgot-password', {
        json: { email: email.trim().toLowerCase() },
        auth: false,
      });
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <PublicLayout title="Recuperar palavra-passe">
      {sent ? (
        <div className="flex flex-col gap-4">
          <Alert kind="success" title="Pedido enviado">
            Se existir uma conta com este email, vai receber uma ligação para definir uma nova
            palavra-passe. A ligação é válida durante 30 minutos.
          </Alert>
          {backToLogin}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          <p className="text-cinza-texto">
            Indique o email da sua conta. Enviamos-lhe uma ligação para definir uma nova
            palavra-passe.
          </p>
          {error ? <Alert kind="error">{error}</Alert> : null}
          <TextField
            label="Email"
            type="email"
            autoComplete="email"
            error={errors.email?.message}
            {...register('email')}
          />
          <Button type="submit" loading={isSubmitting}>
            Enviar ligação
          </Button>
          {backToLogin}
        </form>
      )}
    </PublicLayout>
  );
}

export const newPasswordSchema = z
  .object({
    newPassword: z.string().refine(isValidPassword, PASSWORD_RULE_MESSAGE),
    confirm: z.string(),
  })
  .refine((v) => v.newPassword === v.confirm, {
    path: ['confirm'],
    message: 'As palavras-passe não coincidem.',
  });

/** Public page opened from the reset email (also used by citizens). */
export function ResetPasswordPage() {
  const [params] = useSearchParams();
  const token = params.get('token') ?? '';
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof newPasswordSchema>>({ resolver: zodResolver(newPasswordSchema) });

  const onSubmit = handleSubmit(async ({ newPassword }) => {
    setError(null);
    try {
      await api('POST', '/auth/reset-password', { json: { token, newPassword }, auth: false });
      setDone(true);
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  if (!token) {
    return (
      <PublicLayout title="Redefinir palavra-passe">
        <div className="flex flex-col gap-4">
          <Alert kind="error">
            A ligação não é válida. Peça uma nova ligação em «Recuperar palavra-passe».
          </Alert>
          {backToLogin}
        </div>
      </PublicLayout>
    );
  }

  return (
    <PublicLayout title="Redefinir palavra-passe">
      {done ? (
        <div className="flex flex-col gap-4">
          <Alert kind="success" title="Palavra-passe alterada">
            Já pode iniciar sessão com a nova palavra-passe, na app ou no backoffice.
          </Alert>
          {backToLogin}
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
          {error ? <Alert kind="error">{error}</Alert> : null}
          <TextField
            label="Nova palavra-passe"
            type="password"
            autoComplete="new-password"
            hint={PASSWORD_RULE_MESSAGE}
            error={errors.newPassword?.message}
            {...register('newPassword')}
          />
          <TextField
            label="Confirmar a nova palavra-passe"
            type="password"
            autoComplete="new-password"
            error={errors.confirm?.message}
            {...register('confirm')}
          />
          <Button type="submit" loading={isSubmitting}>
            Guardar palavra-passe
          </Button>
        </form>
      )}
    </PublicLayout>
  );
}
