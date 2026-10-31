import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { CircleCheck } from 'lucide-react-native';
import { useEffect } from 'react';
import { StyleSheet, View } from 'react-native';

import { useOccurrence } from '../../api/queries';
import { useSession } from '../../auth/session';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card, Screen } from '../../components/Layout';
import { Notice } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import { t } from '../../i18n/pt-PT';
import { firstName } from '../../lib/format';
import { useDraft } from '../../store/draft';
import { colors, space } from '../../theme/tokens';

const tx = t.assistente.enviada;

/** A16 · Confirmation after submitting. The draft is cleared as soon as this screen opens. */
export default function Sent() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const user = useSession((s) => s.session?.user);
  const occurrence = useOccurrence(id);

  useEffect(() => {
    useDraft.getState().reset();
  }, []);

  /** Closes the wizard modal, then shows the chosen screen underneath. */
  const leaveTo = (href: '/mapa' | `/minhas/${string}`) => {
    navigation.getParent()?.goBack();
    router.navigate(href);
  };

  return (
    <Screen>
      <View style={styles.hero}>
        <CircleCheck size={72} color={colors.sucesso} aria-hidden />
        <AppText variant="titulo" accessibilityRole="header" style={{ textAlign: 'center' }}>
          {tx.titulo}
        </AppText>
        <AppText variant="corpo" style={{ textAlign: 'center' }}>
          {tx.obrigado(firstName(user?.name ?? ''))}
        </AppText>
      </View>
      {occurrence.data ? (
        <Card style={{ alignItems: 'center' }}>
          <AppText variant="legenda">{tx.referencia}</AppText>
          <AppText variant="h2" selectable>
            {occurrence.data.reference}
          </AppText>
          <StatusBadge status={occurrence.data.status} />
        </Card>
      ) : null}
      {user ? <Notice kind="info">{tx.email(user.email)}</Notice> : null}
      <Button label={tx.ver} onPress={() => leaveTo(`/minhas/${id}`)} />
      <Button label={tx.voltarMapa} variant="secondary" onPress={() => leaveTo('/mapa')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { alignItems: 'center', gap: space.m, paddingVertical: space.xl },
});
