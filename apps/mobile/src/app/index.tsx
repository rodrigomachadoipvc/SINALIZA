import { Redirect } from 'expo-router';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { useSession } from '../auth/session';
import { AppText } from '../components/AppText';
import { Logo } from '../components/Logo';
import { t } from '../i18n/pt-PT';
import { colors, space } from '../theme/tokens';

/** A01 · Opening: checks the saved session, then goes to the map or to sign in. */
export default function Opening() {
  const status = useSession((s) => s.status);
  if (status === 'signedIn') return <Redirect href="/mapa" />;
  if (status === 'signedOut') return <Redirect href="/login" />;
  return (
    <View style={styles.screen} accessibilityLabel={t.comum.carregar}>
      <Logo size={88} />
      <View style={styles.loading}>
        <ActivityIndicator color={colors.azul} />
        <AppText variant="pequeno">{t.comum.carregar}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.xxl,
    backgroundColor: colors.branco,
  },
  loading: { flexDirection: 'row', alignItems: 'center', gap: space.s },
});
