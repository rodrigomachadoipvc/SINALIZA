import { Image } from 'expo-image';
import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { errorMessage } from '../../../api/client';
import { useCancelOccurrence, useOccurrence } from '../../../api/queries';
import { AppText } from '../../../components/AppText';
import { Button } from '../../../components/Button';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Card, Screen, TopBar } from '../../../components/Layout';
import { Notice } from '../../../components/Notice';
import { History } from '../../../components/Occurrence';
import { StatusBadge } from '../../../components/StatusBadge';
import { useSnackbar } from '../../../components/Snackbar';
import { t } from '../../../i18n/pt-PT';
import { SinalizaMap } from '../../../map/SinalizaMap';
import { colors, radius, space } from '../../../theme/tokens';

/** B03/B04 · Detail of one of the citizen's occurrences, with the D2 cancel dialog. */
export default function OccurrenceDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const navigation = useNavigation();
  const snackbar = useSnackbar();
  const query = useOccurrence(id);
  const cancel = useCancelOccurrence(id);
  const [confirming, setConfirming] = useState(false);

  // Back to the list: pop when it is underneath in this tab's stack (opened from a link otherwise).
  const back = () => {
    if (navigation.getState()?.index) router.back();
    else router.replace('/minhas');
  };
  const top = <TopBar title={t.detalhe.titulo} onBack={back} backLabel={t.detalhe.voltar} />;

  if (query.isPending)
    return (
      <Screen top={top}>
        <ActivityIndicator color={colors.azul} accessibilityLabel={t.comum.carregar} />
      </Screen>
    );
  if (query.isError)
    return (
      <Screen top={top}>
        <Notice kind="error" title={t.detalhe.erro}>
          {errorMessage(query.error)}
        </Notice>
        <Button label={t.comum.tentarNovamente} onPress={() => void query.refetch()} />
      </Screen>
    );

  const o = query.data;
  const canCancel = o.status === 'RECEBIDA';

  const confirmCancel = () => {
    cancel.mutate(undefined, {
      onSuccess: () => {
        setConfirming(false);
        snackbar.show(t.detalhe.anulada(o.reference));
        back();
      },
      onError: () => setConfirming(false),
    });
  };

  return (
    <Screen top={top}>
      {o.photoUrl ? (
        <Image
          source={{ uri: o.photoUrl }}
          style={styles.photo}
          contentFit="cover"
          accessibilityLabel={t.mapa.fotografia(o.category.name)}
        />
      ) : (
        <View style={[styles.photo, styles.noPhoto]}>
          <AppText variant="pequeno">{t.mapa.semFotografia}</AppText>
        </View>
      )}
      <View style={styles.row}>
        <StatusBadge status={o.status} />
        <AppText variant="legendaForte">{o.reference}</AppText>
      </View>
      <View style={{ gap: space.xs }}>
        <AppText variant="titulo" accessibilityRole="header">
          {o.category.name}
        </AppText>
        <AppText variant="pequeno">{o.address}</AppText>
      </View>
      <Card>
        <AppText variant="h3">{t.detalhe.descricao}</AppText>
        <AppText variant="corpo">{o.description}</AppText>
      </Card>
      <SinalizaMap
        style={styles.miniMap}
        center={{ lat: o.lat, lng: o.lng }}
        zoom={16}
        marker={{ lat: o.lat, lng: o.lng }}
        interactive={false}
        accessibilityLabel={`${t.detalhe.localizacao}: ${o.address}`}
      />
      <Card>
        <AppText variant="h3" accessibilityRole="header">
          {t.detalhe.historico}
        </AppText>
        <History occurrence={o} />
      </Card>
      {cancel.isError ? <Notice kind="error">{errorMessage(cancel.error)}</Notice> : null}
      {canCancel ? (
        <>
          <Notice kind="info">{t.detalhe.podeAnular}</Notice>
          <Button
            label={t.detalhe.anular}
            variant="destructive"
            onPress={() => setConfirming(true)}
          />
        </>
      ) : o.status !== 'ANULADA' ? (
        <View style={{ gap: space.s }}>
          <Button
            label={t.detalhe.anular}
            variant="destructive"
            disabled
            onPress={() => undefined}
            accessibilityHint={t.detalhe.naoPodeAnular}
          />
          <AppText variant="pequeno">{t.detalhe.naoPodeAnular}</AppText>
        </View>
      ) : null}
      <ConfirmDialog
        visible={confirming}
        title={t.detalhe.anularTitulo}
        message={t.detalhe.anularTexto(o.reference)}
        confirmLabel={t.detalhe.anularConfirmar}
        destructive
        loading={cancel.isPending}
        onConfirm={confirmCancel}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.cartao },
  noPhoto: { backgroundColor: colors.cinzaClaro, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.m, flexWrap: 'wrap' },
  miniMap: { height: 180, borderRadius: radius.cartao },
});
