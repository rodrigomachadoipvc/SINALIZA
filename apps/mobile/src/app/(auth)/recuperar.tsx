import { zodResolver } from '@hookform/resolvers/zod';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { z } from 'zod';

import { errorMessage } from '../../api/client';
import { requestPasswordReset } from '../../auth/actions';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { Screen, ScreenTitle, TopBar } from '../../components/Layout';
import { Notice } from '../../components/Notice';
import { t } from '../../i18n/pt-PT';
import { emailSchema } from '../../lib/validation';

const schema = z.object({ email: emailSchema });

/**
 * C02/C03 · Ask for a reset link. The new password is set on the web page the email links to; the
 * answer is the same whether or not the email is registered.
 */
export default function Recover() {
  const router = useRouter();
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [failure, setFailure] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<z.infer<typeof schema>>({
    resolver: zodResolver(schema),
    defaultValues: { email: '' },
  });

  const submit = handleSubmit(async ({ email }) => {
    setFailure(null);
    try {
      await requestPasswordReset(email);
      setSentTo(email);
    } catch (error) {
      setFailure(errorMessage(error));
    }
  });

  return (
    <Screen top={<TopBar title={t.recuperar.titulo} onBack={() => router.back()} />}>
      <ScreenTitle>{t.recuperar.titulo}</ScreenTitle>
      {sentTo ? (
        <>
          <Notice kind="success">{t.recuperar.enviado(sentTo)}</Notice>
          <Button label={t.recuperar.voltarLogin} onPress={() => router.replace('/login')} />
        </>
      ) : (
        <>
          <AppText variant="corpo">{t.recuperar.explicacao}</AppText>
          {failure ? <Notice kind="error">{failure}</Notice> : null}
          <Controller
            control={control}
            name="email"
            render={({ field }) => (
              <TextField
                label={t.recuperar.email}
                value={field.value}
                onChangeText={field.onChange}
                onBlur={field.onBlur}
                error={errors.email?.message}
                keyboardType="email-address"
                autoCapitalize="none"
                autoComplete="email"
                returnKeyType="send"
                onSubmitEditing={() => void submit()}
              />
            )}
          />
          <Button
            label={t.recuperar.enviar}
            loadingLabel={t.recuperar.aEnviar}
            loading={isSubmitting}
            onPress={() => void submit()}
          />
          <Button label={t.recuperar.voltarLogin} variant="text" onPress={() => router.back()} />
        </>
      )}
    </Screen>
  );
}
