import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';

import { ApiError, errorMessage } from '../../../api/client';
import { useUpdateMe } from '../../../api/queries';
import { useSession } from '../../../auth/session';
import { Button } from '../../../components/Button';
import { TextField } from '../../../components/Field';
import { Screen, TopBar } from '../../../components/Layout';
import { Notice } from '../../../components/Notice';
import { useSnackbar } from '../../../components/Snackbar';
import { t } from '../../../i18n/pt-PT';
import { profileSchema } from '../../../lib/validation';

type Values = z.infer<typeof profileSchema>;

/** C06 · Edit name and phone. The email identifies the account and cannot be changed. */
export default function EditProfile() {
  const router = useRouter();
  const snackbar = useSnackbar();
  const user = useSession((s) => s.session?.user);
  const update = useUpdateMe();
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors },
  } = useForm<Values>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: user?.name ?? '', phone: user?.phone ?? '' },
  });

  const submit = handleSubmit(async ({ name, phone }) => {
    try {
      await update.mutateAsync({ name, phone: phone === '' ? null : phone });
      snackbar.show(t.perfil.guardado);
      router.back();
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields.name) setError('name', { message: error.fields.name });
        if (error.fields.phone) setError('phone', { message: error.fields.phone });
      }
    }
  });

  const fieldErrors =
    update.error instanceof ApiError && Object.keys(update.error.fields).length > 0;

  return (
    <Screen
      top={<TopBar title={t.perfil.editarDados} onBack={() => router.back()} />}
      footer={
        <Button
          label={t.comum.guardar}
          loadingLabel={t.comum.aGuardar}
          loading={update.isPending}
          onPress={() => void submit()}
          style={{ flex: 1 }}
        />
      }
    >
      {update.isError && !fieldErrors ? (
        <Notice kind="error">{errorMessage(update.error)}</Notice>
      ) : null}
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField
            label={t.perfil.nome}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.name?.message}
            autoComplete="name"
          />
        )}
      />
      <TextField
        label={t.perfil.email}
        value={user?.email ?? ''}
        editable={false}
        hint={t.perfil.emailFixo}
      />
      <Controller
        control={control}
        name="phone"
        render={({ field }) => (
          <TextField
            label={t.perfil.telemovelOpcional}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.phone?.message}
            keyboardType="phone-pad"
            autoComplete="tel"
          />
        )}
      />
    </Screen>
  );
}
