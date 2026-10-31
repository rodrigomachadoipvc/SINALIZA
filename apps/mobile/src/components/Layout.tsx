import { ArrowLeft, X } from 'lucide-react-native';
import type { ReactNode } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, space, TOUCH } from '../theme/tokens';
import { AppText } from './AppText';

/** Fixed blue 56 dp bar with an optional back or close button (48 × 48). */
export function TopBar({
  title,
  onBack,
  onClose,
  backLabel = 'Voltar',
  closeLabel = 'Fechar',
  right,
}: {
  title: string;
  onBack?: () => void;
  onClose?: () => void;
  backLabel?: string;
  closeLabel?: string;
  right?: ReactNode;
}) {
  const action = onClose ?? onBack;
  const Icon = onClose ? X : ArrowLeft;
  return (
    <View style={styles.topBar}>
      {action ? (
        <Pressable
          onPress={action}
          accessibilityRole="button"
          accessibilityLabel={onClose ? closeLabel : backLabel}
          style={styles.topAction}
        >
          <Icon size={24} color={colors.branco} />
        </Pressable>
      ) : (
        <View style={{ width: space.s }} />
      )}
      <AppText
        variant="h3"
        accessibilityRole="header"
        numberOfLines={1}
        style={{ color: colors.branco, flex: 1 }}
      >
        {title}
      </AppText>
      {right ?? <View style={{ width: TOUCH }} />}
    </View>
  );
}

/**
 * Screen frame: safe areas, a fixed top bar and footer, and only the content scrolls. Forms move
 * above the keyboard.
 */
export function Screen({
  top,
  footer,
  children,
  scroll = true,
  contentStyle,
}: {
  top?: ReactNode;
  footer?: ReactNode;
  children: ReactNode;
  scroll?: boolean;
  contentStyle?: ViewStyle;
}) {
  const content = scroll ? (
    <ScrollView
      contentContainerStyle={[styles.content, contentStyle]}
      keyboardShouldPersistTaps="handled"
    >
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, contentStyle]}>{children}</View>
  );
  return (
    <SafeAreaView style={styles.safe} edges={['top', 'left', 'right']}>
      {top}
      <KeyboardAvoidingView
        style={styles.body}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        {content}
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

/** Screen title in Poppins (24/32). */
export function ScreenTitle({ children }: { children: string }) {
  return (
    <AppText variant="titulo" accessibilityRole="header">
      {children}
    </AppText>
  );
}

export function Card({ children, style }: { children: ReactNode; style?: ViewStyle }) {
  return <View style={[styles.card, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.azul },
  body: { flex: 1, backgroundColor: colors.branco },
  content: { padding: space.l, gap: space.l, paddingBottom: space.xxl },
  footer: {
    flexDirection: 'row',
    gap: space.m,
    padding: space.l,
    borderTopWidth: 1,
    borderTopColor: colors.cinzaDivisoria,
    backgroundColor: colors.branco,
  },
  topBar: {
    height: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.xs,
    backgroundColor: colors.azul,
  },
  topAction: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  card: {
    backgroundColor: colors.branco,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.cinzaDivisoria,
    padding: space.l,
    gap: space.m,
  },
});
