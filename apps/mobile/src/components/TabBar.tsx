import { type Tabs, useRouter } from 'expo-router';
import { List, type LucideIcon, Map as MapIcon, Plus, User } from 'lucide-react-native';
import type { ComponentProps } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { t } from '../i18n/pt-PT';
import { colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';

type TabBarProps = Parameters<NonNullable<ComponentProps<typeof Tabs>['tabBar']>>[0];

const TABS: Record<string, { label: string; icon: LucideIcon }> = {
  mapa: { label: t.separadores.mapa, icon: MapIcon },
  minhas: { label: t.separadores.minhas, icon: List },
  perfil: { label: t.separadores.perfil, icon: User },
};

/**
 * Blue 64 dp bar: Mapa · Reportar · Minhas · Perfil. «Reportar» is not a tab: it opens the report
 * wizard as a full-screen modal over whatever tab is showing.
 */
export function TabBar({ state, navigation }: TabBarProps) {
  const router = useRouter();
  const insets = useSafeAreaInsets();

  const tab = (index: number) => {
    const route = state.routes[index];
    const info = route ? TABS[route.name] : undefined;
    if (!route || !info) return null;
    const focused = state.index === index;
    const Icon = info.icon;
    const color = focused ? colors.amarelo : colors.branco;
    return (
      <Pressable
        key={route.key}
        onPress={() => {
          const event = navigation.emit({
            type: 'tabPress',
            target: route.key,
            canPreventDefault: true,
          });
          if (!focused && !event.defaultPrevented) navigation.navigate(route.name);
        }}
        accessibilityRole="tab"
        accessibilityLabel={info.label}
        accessibilityState={{ selected: focused }}
        style={[styles.tab, focused ? styles.tabActive : null]}
      >
        <Icon size={24} color={color} strokeWidth={focused ? 2.5 : 2} />
        <AppText variant="legendaForte" style={{ color }}>
          {info.label}
        </AppText>
      </Pressable>
    );
  };

  return (
    <View style={[styles.bar, { paddingBottom: insets.bottom }]} accessibilityRole="tablist">
      <View style={styles.row}>
        {tab(0)}
        <Pressable
          onPress={() => router.push('/reportar')}
          accessibilityRole="button"
          accessibilityLabel={t.separadores.reportar}
          accessibilityHint={t.separadores.reportarDica}
          style={styles.tab}
        >
          {({ pressed }) => (
            <>
              <View
                style={[
                  styles.pill,
                  pressed ? { backgroundColor: colors.amareloPressionado } : null,
                ]}
              >
                <Plus size={24} color={colors.azul} strokeWidth={3} />
              </View>
              <AppText variant="legendaForte" style={{ color: colors.branco }}>
                {t.separadores.reportar}
              </AppText>
            </>
          )}
        </Pressable>
        {tab(1)}
        {tab(2)}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: { backgroundColor: colors.azul },
  row: { height: 64, flexDirection: 'row', alignItems: 'stretch', paddingHorizontal: space.xs },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
    marginVertical: space.xs,
    borderRadius: radius.campo,
  },
  tabActive: { backgroundColor: colors.brancoRealce },
  pill: {
    width: 48,
    height: 30,
    borderRadius: radius.total,
    backgroundColor: colors.amarelo,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
