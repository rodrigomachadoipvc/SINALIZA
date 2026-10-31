import { zodResolver } from '@hookform/resolvers/zod';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { StyleSheet, View } from 'react-native';
import type { z } from 'zod';

import { ApiError, errorMessage } from '../../api/client';
import { signIn } from '../../auth/actions';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { TextField } from '../../components/Field';
import { Screen, ScreenTitle } from '../../components/Layout';
import { Logo } from '../../components/Logo';
import { Notice } from '../../components/Notice';
import { t } from '../../i18n/pt-PT';
import { loginSchema } from '../../lib/validation';
import { colors, space } from '../../theme/tokens';

type Values = z.infer<typeof loginSchema>;

/** A02–A04 · Sign in. A wrong password marks the password field and focuses it. */
export default function Login() {
  const { created } = useLocalSearchParams<{ created?: string }>();
  const [failure, setFailure] = useState<string | null>(null);
  const {
    control,
    handleSubmit,
    setError,
    setFocus,
    formState: { errors, isSubmitting },
  } = useForm<Values>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: '', password: '' },
  });

  const submit = handleSubmit(async ({ email, password }) => {
    setFailure(null);
    try {
      await signIn(email, password);
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) {
        setFailure(t.login.erro401);
        setError('password', { type: 'server', message: t.login.erro401 }, { shouldFocus: true });
      } else {
        setFailure(errorMessage(error));
      }
    }
  });

  return (
    <Screen>
      <View style={styles.logo}>
        <Logo size={64} />
      </View>
      <ScreenTitle>{t.login.titulo}</ScreenTitle>
      <AppText variant="pequeno">{t.login.subtitulo}</AppText>
      {created && !failure ? <Notice kind="success">{t.login.contaCriada}</Notice> : null}
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      <Controller
        control={control}
        name="email"
        render={({ field }) => (
          <TextField
            label={t.login.email}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            error={errors.email?.message}
            editable={!isSubmitting}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="next"
            onSubmitEditing={() => setFocus('password')}
          />
        )}
      />
      <Controller
        control={control}
        name="password"
        render={({ field }) => (
          <TextField
            ref={field.ref}
            label={t.login.palavraPasse}
            password
            editable={!isSubmitting}
            value={field.value}
            onChangeText={field.onChange}
            onBlur={field.onBlur}
            // The 401 text is already in the notice above; the field only shows the error border.
            invalid={errors.password?.type === 'server'}
            error={errors.password?.type === 'server' ? undefined : errors.password?.message}
            autoComplete="current-password"
            textContentType="password"
            returnKeyType="go"
            onSubmitEditing={() => void submit()}
          />
        )}
      />
      <Link href="/recuperar" style={styles.link}>
        <AppText variant="rotulo" style={styles.linkText}>
          {t.login.esqueci}
        </AppText>
      </Link>
      <Button
        label={t.login.entrar}
        loadingLabel={t.login.aEntrar}
        loading={isSubmitting}
        onPress={() => void submit()}
      />
      <View style={styles.row}>
        <AppText variant="pequeno">{t.login.semConta}</AppText>
        <Link href="/criar-conta" style={styles.link}>
          <AppText variant="rotulo" style={styles.linkText}>
            {t.login.criarConta}
          </AppText>
        </Link>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: { alignItems: 'center', paddingVertical: space.l },
  link: { alignSelf: 'flex-start', paddingVertical: space.m },
  linkText: { color: colors.info, textDecorationLine: 'underline' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s, flexWrap: 'wrap' },
});
