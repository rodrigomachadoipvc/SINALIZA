import { type OccurrenceStatus, STATUS_LABELS } from '@sinaliza/shared';
import { Image } from 'expo-image';
import { useMemo, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { errorMessage } from '../../api/client';
import { useCategories, useMapDetail, useMapPins, useMunicipality } from '../../api/queries';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Chip } from '../../components/Chip';
import { CategoryIcon } from '../../components/icons';
import { Notice } from '../../components/Notice';
import { StatusBadge } from '../../components/StatusBadge';
import { BARCELOS } from '../../config';
import { t } from '../../i18n/pt-PT';
import { relativeDay } from '../../lib/format';
import { SinalizaMap } from '../../map/SinalizaMap';
import type { MapPinView } from '../../map/types';
import { colors, radius, space, statusColors } from '../../theme/tokens';

const LEGEND: OccurrenceStatus[] = ['RECEBIDA', 'EM_ANALISE', 'EM_RESOLUCAO', 'RESOLVIDA'];

/** A05 · Public map of the municipality, with category filters and the D4 detail panel. */
export default function MapScreen() {
  const [category, setCategory] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const categories = useCategories();
  const municipality = useMunicipality();
  const pins = useMapPins(category);

  const iconBySlug = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.slug, c.icon])),
    [categories.data],
  );
  const views = useMemo<MapPinView[]>(
    () =>
      (pins.data?.items ?? []).map((p) => ({
        id: p.id,
        lat: p.lat,
        lng: p.lng,
        status: p.status,
        label: t.mapa.pino(p.category.name, STATUS_LABELS[p.status], p.reference),
      })),
    [pins.data],
  );

  return (
    <View style={styles.screen}>
      <SinalizaMap
        style={StyleSheet.absoluteFill}
        center={BARCELOS}
        zoom={BARCELOS.zoom}
        accessibilityLabel={t.mapa.mapaDescricao}
        boundary={municipality.data?.boundary}
        pins={views}
        onPinPress={setSelected}
      />
      <SafeAreaView edges={['top']} style={styles.overlay} pointerEvents="box-none">
        <View style={styles.header}>
          <AppText variant="h3" accessibilityRole="header">
            {t.mapa.titulo}
          </AppText>
          <View style={styles.headerRow}>
            {pins.isFetching ? <ActivityIndicator size="small" color={colors.azul} /> : null}
            <AppText variant="pequeno" accessibilityLiveRegion="polite">
              {t.mapa.visiveis(views.length)}
            </AppText>
          </View>
        </View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
          accessibilityLabel={t.mapa.filtroCategorias}
        >
          <Chip
            label={t.mapa.todas}
            selected={category === null}
            onPress={() => setCategory(null)}
          />
          {(categories.data ?? [])
            .filter((c) => c.active)
            .map((c) => (
              <Chip
                key={c.id}
                label={c.name}
                selected={category === c.slug}
                onPress={() => setCategory(c.slug)}
              />
            ))}
        </ScrollView>
        {pins.isError ? <Notice kind="error">{errorMessage(pins.error)}</Notice> : null}
        {pins.data?.truncated ? <Notice kind="warning">{t.mapa.demasiadas}</Notice> : null}
      </SafeAreaView>
      <View
        style={styles.legend}
        accessible
        accessibilityLabel={`${t.mapa.legenda}: ${LEGEND.map((s) => STATUS_LABELS[s]).join(', ')}`}
      >
        {LEGEND.map((s) => (
          <View key={s} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: statusColors[s] }]} />
            <AppText variant="legenda" style={{ color: colors.azul }}>
              {STATUS_LABELS[s]}
            </AppText>
          </View>
        ))}
      </View>
      <PinPanel id={selected} iconBySlug={iconBySlug} onClose={() => setSelected(null)} />
    </View>
  );
}

/** D4 · Bottom panel with the public detail of one pin (never who reported it). */
function PinPanel({
  id,
  iconBySlug,
  onClose,
}: {
  id: string | null;
  iconBySlug: Map<string, string>;
  onClose: () => void;
}) {
  const detail = useMapDetail(id);
  const o = detail.data;
  return (
    <Modal visible={id !== null} transparent animationType="slide" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t.comum.fechar} />
      <View style={styles.panel} accessibilityViewIsModal>
        <View style={styles.handle} />
        <ScrollView contentContainerStyle={styles.panelContent}>
          {detail.isPending ? (
            <ActivityIndicator color={colors.azul} accessibilityLabel={t.comum.carregar} />
          ) : detail.isError ? (
            <Notice kind="error">{errorMessage(detail.error)}</Notice>
          ) : o ? (
            <>
              <View style={styles.panelTitle}>
                <View style={styles.categoryIcon}>
                  <CategoryIcon name={iconBySlug.get(o.category.slug)} />
                </View>
                <View style={{ flex: 1 }}>
                  <AppText variant="h2" accessibilityRole="header">
                    {o.category.name}
                  </AppText>
                  <AppText variant="pequeno">{o.address}</AppText>
                </View>
              </View>
              <StatusBadge status={o.status} />
              <AppText variant="legenda">
                {relativeDay(o.createdAt)} · {o.reference}
              </AppText>
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
              <AppText variant="corpo">{o.description}</AppText>
              <AppText variant="legenda">{t.comum.privacidadeMapa}</AppText>
            </>
          ) : null}
          <Button label={t.comum.fechar} variant="secondary" onPress={onClose} />
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cinzaClaro },
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, gap: space.s, padding: space.m },
  header: {
    backgroundColor: colors.branco,
    borderRadius: radius.cartao,
    padding: space.m,
    gap: 2,
    shadowColor: colors.azul,
    shadowOpacity: 0.15,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 3,
  },
  headerRow: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  chips: { gap: space.s, paddingVertical: space.xs },
  legend: {
    position: 'absolute',
    left: space.m,
    bottom: space.xxl,
    backgroundColor: colors.branco,
    borderRadius: radius.campo,
    padding: space.s,
    gap: space.xs,
    elevation: 3,
    shadowColor: colors.azul,
    shadowOpacity: 0.15,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
  },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  legendDot: { width: 12, height: 12, borderRadius: 6, borderWidth: 2, borderColor: colors.branco },
  backdrop: { flex: 1, backgroundColor: colors.fundoDialogo },
  panel: {
    maxHeight: '75%',
    backgroundColor: colors.branco,
    borderTopLeftRadius: radius.cartao * 2,
    borderTopRightRadius: radius.cartao * 2,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.cinzaDivisoria,
    marginTop: space.s,
  },
  panelContent: { padding: space.l, gap: space.m, paddingBottom: space.xxl },
  panelTitle: { flexDirection: 'row', alignItems: 'center', gap: space.m },
  categoryIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cinzaClaro,
  },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.cartao },
  noPhoto: { backgroundColor: colors.cinzaClaro, alignItems: 'center', justifyContent: 'center' },
});
