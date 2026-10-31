import { OPEN_STATUSES, type OccurrenceStatus, STATUS_LABELS } from '@sinaliza/shared';
import { ChevronRight } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import type { HistoryEntry, OccurrenceCard as Card, OccurrenceDetail } from '../api/types';
import { t } from '../i18n/pt-PT';
import { formatDate, formatDateTime } from '../lib/format';
import { colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';
import { CategoryIcon } from './icons';
import { StatusBadge } from './StatusBadge';

/** Occurrence card for «As minhas ocorrências». */
export function OccurrenceCard({
  occurrence: o,
  icon,
  onPress,
}: {
  occurrence: Card;
  icon: string | undefined;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t.minhas.cartao(o.category.name, STATUS_LABELS[o.status], o.reference)}
      style={({ pressed }) => [
        styles.card,
        pressed ? { backgroundColor: colors.cinzaClaro } : null,
      ]}
    >
      <View style={styles.icon}>
        <CategoryIcon name={icon} />
      </View>
      <View style={styles.body}>
        <AppText variant="h3">{o.category.name}</AppText>
        <AppText variant="pequeno" numberOfLines={1}>
          {o.address}
        </AppText>
        <StatusBadge status={o.status} />
        <AppText variant="legenda">
          {o.reference} · {formatDate(o.createdAt)}
        </AppText>
      </View>
      <ChevronRight size={24} color={colors.cinzaTexto} />
    </Pressable>
  );
}

/** Normal path, used to list the steps still to come. */
const MAIN_PATH: OccurrenceStatus[] = ['RECEBIDA', 'EM_ANALISE', 'EM_RESOLUCAO', 'RESOLVIDA'];

/** Status history as a timeline: done, current and pending items. */
export function History({ occurrence: o }: { occurrence: OccurrenceDetail }) {
  const pending = OPEN_STATUSES.includes(o.status)
    ? MAIN_PATH.slice(MAIN_PATH.indexOf(o.status) + 1)
    : [];
  return (
    <View accessibilityRole="list">
      {o.history.map((entry, i) => (
        <HistoryItem
          key={`${entry.to}-${entry.changedAt}`}
          entry={entry}
          original={entry.to === 'DUPLICADA' ? o.original?.reference : undefined}
          state={i === o.history.length - 1 ? 'current' : 'done'}
          last={i === o.history.length - 1 && pending.length === 0}
        />
      ))}
      {pending.map((status, i) => (
        <View
          key={status}
          style={styles.item}
          accessible
          accessibilityLabel={`${STATUS_LABELS[status]}, ${t.detalhe.pendente}`}
        >
          <View style={styles.rail}>
            <View style={[styles.dot, styles.dotPending]} />
            {i < pending.length - 1 ? <View style={styles.line} /> : null}
          </View>
          <AppText variant="corpo" style={{ color: colors.cinzaTexto, paddingBottom: space.l }}>
            {STATUS_LABELS[status]} ({t.detalhe.pendente})
          </AppText>
        </View>
      ))}
    </View>
  );
}

function HistoryItem({
  entry,
  state,
  last,
  original,
}: {
  entry: HistoryEntry;
  state: 'done' | 'current';
  last: boolean;
  original: string | undefined;
}) {
  const who = entry.changedByRole === 'CIDADAO' ? t.detalhe.porCidadao : t.detalhe.porMunicipio;
  return (
    <View style={styles.item} accessible>
      <View style={styles.rail}>
        <View style={[styles.dot, state === 'current' ? styles.dotCurrent : styles.dotDone]} />
        {last ? null : <View style={styles.line} />}
      </View>
      <View style={styles.itemBody}>
        <AppText variant="h3">
          {STATUS_LABELS[entry.to]}
          {state === 'current' ? ` (${t.detalhe.atual})` : ''}
        </AppText>
        <AppText variant="pequeno">
          {formatDateTime(entry.changedAt)} · {who}
        </AppText>
        {entry.reason ? (
          <AppText variant="pequeno">{t.detalhe.fundamentacao(entry.reason)}</AppText>
        ) : null}
        {entry.note ? <AppText variant="pequeno">{entry.note}</AppText> : null}
        {original ? <AppText variant="pequeno">{t.detalhe.associada(original)}</AppText> : null}
      </View>
    </View>
  );
}

/** Grey placeholder blocks while a list loads. */
export function SkeletonCard() {
  return (
    <View style={styles.card} aria-hidden>
      <View style={[styles.icon, { backgroundColor: colors.cinzaDivisoria }]} />
      <View style={[styles.body, { gap: space.s }]}>
        <View style={[styles.bone, { width: '60%' }]} />
        <View style={[styles.bone, { width: '90%' }]} />
        <View style={[styles.bone, { width: '35%' }]} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    padding: space.l,
    borderRadius: radius.cartao,
    borderWidth: 1,
    borderColor: colors.cinzaDivisoria,
    backgroundColor: colors.branco,
  },
  icon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cinzaClaro,
  },
  body: { flex: 1, gap: space.xs },
  bone: { height: 12, borderRadius: 6, backgroundColor: colors.cinzaDivisoria },
  item: { flexDirection: 'row', gap: space.m },
  rail: { width: 16, alignItems: 'center' },
  dot: { width: 16, height: 16, borderRadius: 8, marginTop: 4 },
  dotDone: { backgroundColor: colors.azul },
  dotCurrent: { backgroundColor: colors.amarelo, borderWidth: 2, borderColor: colors.azul },
  dotPending: { backgroundColor: colors.branco, borderWidth: 2, borderColor: colors.cinzaContorno },
  line: { flex: 1, width: 2, backgroundColor: colors.cinzaDivisoria, marginVertical: 2 },
  itemBody: { flex: 1, gap: 2, paddingBottom: space.l },
});
