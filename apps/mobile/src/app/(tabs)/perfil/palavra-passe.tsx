import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';

import { ApiError, errorMessage } from '../../../api/client';
import { useChangePassword } from '../../../api/queries';
import { Button } from '../../../components/Button';
import { TextField } from '../../../components/Field';
import { Screen, TopBar } from '../../../components/Layout';
import { Notice } from '../../../components/Notice';
import { useSnackbar } from '../../../components/Snackbar';
import { t } from '../../../i18n/pt-PT';
import { changePasswordSchema } from '../../../lib/validation';

type Values = z.infer<typeof changePasswordSchema>;
const NAMES = ['currentPassword', 'newPassword', 'confirm'] as const;
const LABELS: Record<(typeof NAMES)[number], string> = {
  currentPassword: t.perfil.palavraPasseAtual,
  newPassword: t.perfil.novaPalavraPasse,
  confirm: t.perfil.confirmarPalavraPasse,
};

/** C07 · Change the password; the API checks the current one. */
export default function ChangePassword() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const change = useChangePassword();
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: '', newPassword: '', confirm: '' },
  });

  const submit = handleSubmit(async ({ currentPassword, newPassword }) => {
    try {
      await change.mutateAsync({ currentPassword, newPassword });
      snackbar.show(t.perfil.palavraPasseAlterada);
      router.back();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields.currentPassword)
          setError('currentPassword', { message: error.fields.currentPassword });
        if (error.fields.newPassword)
          setError('newPassword', { message: error.fields.newPassword });
      }
    }
  });

  const fieldErrors =
    change.error instanceof ApiError && Object.keys(change.error.fields).length > 0;

  return (
    <Screen
      top={<TopBar title={t.perfil.alterarPalavraPasse} onBack={() => router.back()} />}
      footer={
        <Button
          label={t.comum.guardar}
          loadingLabel={t.comum.aGuardar}
          loading={change.isPending}
          onPress={() => void submit()}
          style={{ flex: 1 }}
        />
      }
    >
      {change.isError && !fieldErrors ? (
        <Notice kind="error">{errorMessage(change.error)}</Notice>
      ) : null}
      {NAMES.map((name) => (
        <Controller
          key={name}
          control={control}
          name={name}
          render={({ field }) => (
            <TextField
              label={LABELS[name]}
              password
              value={field.value}
              onChangeText={field.onChange}
              onBlur={field.onBlur}
              error={errors[name]?.message}
              hint={name === 'newPassword' ? t.registo.ajudaPalavraPasse : undefined}
              autoComplete={name === 'currentPassword' ? 'current-password' : 'new-password'}
            />
          )}
        />
      ))}
    </Screen>
  );
}
