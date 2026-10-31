import {
  CircleAlert,
  CircleCheck,
  Info,
  type LucideIcon,
  TriangleAlert,
} from 'lucide-react-native';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';

export type NoticeKind = 'error' | 'warning' | 'success' | 'info';

const LOOK: Record<NoticeKind, { bg: string; bar: string; icon: LucideIcon; iconColor: string }> = {
  error: { bg: colors.superficieErro, bar: colors.erro, icon: CircleAlert, iconColor: colors.erro },
  warning: {
    bg: colors.superficieAmarelo,
    bar: colors.amarelo,
    icon: TriangleAlert,
    iconColor: colors.ambar,
  },
  success: {
    bg: colors.superficieSucesso,
    bar: colors.sucesso,
    icon: CircleCheck,
    iconColor: colors.sucesso,
  },
  info: { bg: colors.superficieInfo, bar: colors.info, icon: Info, iconColor: colors.info },
};

/** Notice with a 4 px side bar; errors are announced to screen readers straight away. */
export function Notice({
  kind,
  children,
  title,
}: {
  kind: NoticeKind;
  children: ReactNode;
  title?: string;
}) {
  const look = LOOK[kind];
  const Icon = look.icon;
  return (
    <View
      style={[styles.box, { backgroundColor: look.bg, borderLeftColor: look.bar }]}
      accessibilityRole={kind === 'error' ? 'alert' : 'summary'}
      accessibilityLiveRegion={kind === 'error' ? 'assertive' : 'polite'}
    >
      <Icon size={24} color={look.iconColor} aria-hidden />
      <View style={styles.text}>
        {title ? <AppText variant="h3">{title}</AppText> : null}
        {typeof children === 'string' ? <AppText variant="corpo">{children}</AppText> : children}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    gap: space.m,
    padding: space.l,
    borderRadius: radius.campo,
    borderLeftWidth: 4,
  },
  text: { flex: 1, gap: space.xs },
});
