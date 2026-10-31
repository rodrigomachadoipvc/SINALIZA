import { CitizenStatusGroup } from '@sinaliza/shared';
import { useRouter } from 'expo-router';
import { Inbox } from 'lucide-react-native';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  RefreshControl,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';

import { errorMessage } from '../../../api/client';
import { useCategories, useMyOccurrences } from '../../../api/queries';
import { AppText } from '../../../components/AppText';
import { Button } from '../../../components/Button';
import { Chip } from '../../../components/Chip';
import { Screen, TopBar } from '../../../components/Layout';
import { Notice } from '../../../components/Notice';
import { OccurrenceCard, SkeletonCard } from '../../../components/Occurrence';
import { t } from '../../../i18n/pt-PT';
import { colors, space } from '../../../theme/tokens';

const GROUPS = Object.values(CitizenStatusGroup);

/** B01/B02 · The citizen's occurrences, by status group, with infinite scrolling. */
export default function MyOccurrences() {
  const router = useRouter();
  const [group, setGroup] = useState<CitizenStatusGroup>('todas');
  const query = useMyOccurrences(group);
  const categories = useCategories();

  const iconBySlug = useMemo(
    () => new Map((categories.data ?? []).map((c) => [c.slug, c.icon])),
    [categories.data],
  );
  const items = useMemo(() => query.data?.pages.flatMap((p) => p.items) ?? [], [query.data]);
  const total = query.data?.pages[0]?.total ?? 0;

  const empty = (
    <View style={styles.empty}>
      <View style={styles.emptyIcon}>
        <Inbox size={32} color={colors.azul} />
      </View>
      <AppText variant="h2" style={{ textAlign: 'center' }}>
        {t.minhas.vazioTitulo[group]}
      </AppText>
      <AppText variant="corpo" style={{ textAlign: 'center', color: colors.cinzaTexto }}>
        {t.minhas.vazioTexto[group]}
      </AppText>
      {group === 'todas' ? (
        <Button
          label={t.minhas.reportar}
          variant="highlight"
          onPress={() => router.push('/reportar')}
        />
      ) : (
        <Button label={t.minhas.verTodas} variant="secondary" onPress={() => setGroup('todas')} />
      )}
    </View>
  );

  let body;
  if (query.isPending) {
    body = (
      <View style={styles.list} accessibilityLabel={t.comum.carregar}>
        {[0, 1, 2, 3].map((i) => (
          <SkeletonCard key={i} />
        ))}
      </View>
    );
  } else if (query.isError) {
    body = (
      <View style={styles.list}>
        <Notice kind="error" title={t.minhas.erro}>
          {errorMessage(query.error)}
        </Notice>
        <Button label={t.comum.tentarNovamente} onPress={() => void query.refetch()} />
      </View>
    );
  } else {
    body = (
      <FlatList
        data={items}
        keyExtractor={(o) => o.id}
        contentContainerStyle={[styles.list, items.length === 0 ? { flexGrow: 1 } : null]}
        ListHeaderComponent={
          items.length > 0 ? (
            <AppText variant="pequeno" accessibilityLiveRegion="polite">
              {t.minhas.contador(total)}
            </AppText>
          ) : null
        }
        ListEmptyComponent={empty}
        renderItem={({ item }) => (
          <OccurrenceCard
            occurrence={item}
            icon={iconBySlug.get(item.category.slug)}
            onPress={() => router.push(`/minhas/${item.id}`)}
          />
        )}
        onEndReachedThreshold={0.5}
        onEndReached={() => {
          if (query.hasNextPage && !query.isFetchingNextPage) void query.fetchNextPage();
        }}
        ListFooterComponent={
          query.isFetchingNextPage ? <ActivityIndicator color={colors.azul} /> : null
        }
        refreshControl={
          <RefreshControl
            refreshing={query.isRefetching && !query.isFetchingNextPage}
            onRefresh={() => void query.refetch()}
            colors={[colors.azul]}
            tintColor={colors.azul}
          />
        }
      />
    );
  }

  return (
    <Screen top={<TopBar title={t.minhas.titulo} />} scroll={false}>
      <View>
        <ScrollView
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.chips}
        >
          {GROUPS.map((g) => (
            <Chip
              key={g}
              label={t.minhas.filtros[g]}
              selected={g === group}
              onPress={() => setGroup(g)}
            />
          ))}
        </ScrollView>
      </View>
      {body}
    </Screen>
  );
}

const styles = StyleSheet.create({
  chips: { gap: space.s, paddingHorizontal: space.l, paddingVertical: space.m },
  list: { padding: space.l, paddingTop: 0, gap: space.m },
  empty: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.l,
    padding: space.xl,
  },
  emptyIcon: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: colors.cinzaClaro,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
