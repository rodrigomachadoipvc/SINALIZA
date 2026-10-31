import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useRouter } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import type { z } from 'zod';

import { ApiError, errorMessage } from '../../api/client';
import { register } from '../../auth/actions';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { Screen, ScreenTitle, TopBar } from '../../components/Layout';
import { Notice } from '../../components/Notice';
import { t } from '../../i18n/pt-PT';
import { registerSchema } from '../../lib/validation';
import { colors, space } from '../../theme/tokens';

type Values = z.infer<typeof registerSchema>;
const FIELDS = ['name', 'email', 'password'] as const;

/** C01 · Create a citizen account; on success the person signs in with it. */
export default function Register() {
  const router = useRouter();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(registerSchema),
    defaultValues: { name: '', email: '', password: '' },
  });

  const submit = handleSubmit(async (values) => {
    setFailure(null);
    try {
      await register(values);
      router.replace({ pathname: '/login', params: { created: '1' } });
    } catch (error) {
      const fields = error instanceof ApiError ? error.fields : {};
      let marked = false;
      for (const name of FIELDS) {
        const message = fields[name];
        if (message) {
          setError(name, { message });
          marked = true;
        }
      }
      // A 409 (email already registered) belongs to the email field.
      if (error instanceof ApiError && error.status === 409)
        setError('email', { message: error.message });
      else if (!marked) setFailure(errorMessage(error));
    }
  });

  return (
    <Screen top={<TopBar title={t.registo.titulo} onBack={() => router.back()} />}>
      <ScreenTitle>{t.registo.titulo}</ScreenTitle>
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      <Controller
        control={control}
        name="name"
        render={({ field }) => (
          <TextField
            label={t.registo.nome}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.name?.message}
            autoComplete="name"
            textContentType="name"
          />
        )}
      />
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label={t.registo.email}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            label={t.registo.palavraPasse}
            password
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.password?.message}
            hint={t.registo.ajudaPalavraPasse}
            autoComplete="new-password"
            textContentType="newPassword"
          />
        )}
      />
      <Notice kind="info">{t.registo.privacidade}</Notice>
      <Button
        label={t.registo.criar}
        loadingLabel={t.registo.aCriar}
        loading={isSubmitting}
        onPress={() => void submit()}
      />
      <View style={styles.row}>
        <AppText variant="pequeno">{t.registo.jaTemConta}</AppText>
        <Link href="/login" style={styles.link}>
          <AppText variant="rotulo" style={styles.linkText}>
            {t.registo.iniciarSessao}
          </AppText>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  link: { paddingVertical: space.m },
  linkText: { color: colors.info, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexWrap: 'wrap' },
});
