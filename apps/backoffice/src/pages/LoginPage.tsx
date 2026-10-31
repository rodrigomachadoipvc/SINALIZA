import { zodResolver } from '@hookform/resolvers/zod';
import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Link, Navigate, useLocation, useNavigate } from 'react-router';
import { z } from 'zod';

import { errorMessage } from '../api/client';
import { useAuth } from '../auth/auth';
import { type EndReason, sessionStore } from '../auth/session-store';
import { Alert } from '../components/Alert';
import { Button } from '../components/Button';
import { TextField } from '../components/Field';
import { PublicLayout } from './PublicLayout';

const schema = z.object({
  email: z.email('Indique um email válido.'),
  password: z.string().min(1, 'Indique a palavra-passe.'),
});

type Values = z.infer<typeof schema>;

const END_MESSAGES: Partial<Record<EndReason, string>> = {
  inactive: 'A sessão terminou após 30 minutos sem atividade. Inicie sessão novamente.',
  expired: 'A sessão expirou. Inicie sessão novamente.',
};

export function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState<string | null>(null);
  const [endReason] = useState(() => sessionStore.takeEndReason());
  const notice = endReason ? (END_MESSAGES[endReason] ?? null) : null;
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  // After an expired session the same person comes back to the page they were on; after
  // «Terminar sessão» the next person may be someone else, so they start on the dashboard.
  const from =
    endReason === 'logout' ? '/' : ((location.state as { from?: string } | null)?.from ?? '/');
  if (user) return <Navigate to={from} replace />;

  const onSubmit = handleSubmit(async (values) => {
    setError(null);
    try {
      await login(values.email.trim().toLowerCase(), values.password);
      void navigate(from, { replace: true });
    } catch (e) {
      setError(errorMessage(e));
    }
  });

  return (
    <PublicLayout title="Iniciar sessão">
      <form onSubmit={onSubmit} noValidate className="flex flex-col gap-4">
        {notice && !error ? <Alert kind="info">{notice}</Alert> : null}
        {error ? <Alert kind="error">{error}</Alert> : null}
        <TextField
          label="Email"
          type="email"
          autoComplete="username"
          error={errors.email?.message}
          {...register('email')}
        />
        <TextField
          label="Palavra-passe"
          type="password"
          autoComplete="current-password"
          error={errors.password?.message}
          {...register('password')}
        />
        <Button type="submit" loading={isSubmitting} className="mt-2">
          Entrar
        </Button>
        <Link
          to="/recuperar-palavra-passe"
          className="self-center py-3 text-pequeno font-medium text-azul underline underline-offset-4"
        >
          Recuperar palavra-passe
        </Link>
      </form>
    </PublicLayout>
  );
}
