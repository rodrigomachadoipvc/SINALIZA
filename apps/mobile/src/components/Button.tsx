import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  type StyleProp,
  StyleSheet,
  View,
  type ViewStyle,
} from 'react-native';

import { colors, radius, space, TOUCH } from '../theme/tokens';
import { AppText } from './AppText';

export type ButtonVariant = 'primary' | 'highlight' | 'secondary' | 'destructive' | 'text';

const LOOK: Record<ButtonVariant, { bg: string; pressed: string; text: string; border?: string }> =
  {
    primary: { bg: colors.azul, pressed: colors.azulPressionado, text: colors.branco },
    // Yellow always carries blue text, never white (spec section 6).
    highlight: { bg: colors.amarelo, pressed: colors.amareloPressionado, text: colors.azul },
    secondary: {
      bg: colors.branco,
      pressed: colors.cinzaClaro,
      text: colors.azul,
      border: colors.azul,
    },
    destructive: { bg: colors.erro, pressed: colors.erroPressionado, text: colors.branco },
    text: { bg: 'transparent', pressed: colors.cinzaClaro, text: colors.azul },
  };

interface Props {
  label: string;
  onPress: () => void;
  variant?: ButtonVariant;
  disabled?: boolean;
  loading?: boolean;
  /** Text while loading («A entrar…»); defaults to the label. */
  loadingLabel?: string;
  icon?: ReactNode;
  accessibilityHint?: string;
  style?: StyleProp<ViewStyle>;
  testID?: string;
}

/** Button with normal, pressed, disabled and loading (spinner + text) states. */
export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled = false,
  loading = false,
  loadingLabel,
  icon,
  accessibilityHint,
  style,
  testID,
}: Props) {
  const look = LOOK[variant];
  const inactive = disabled || loading;
  return (
    <Pressable
      testID={testID}
      onPress={onPress}
      disabled={inactive}
      accessibilityRole="button"
      accessibilityLabel={loading ? (loadingLabel ?? label) : label}
      accessibilityHint={accessibilityHint}
      accessibilityState={{ disabled: inactive, busy: loading }}
      style={({ pressed }) => [
        styles.base,
        {
          backgroundColor: pressed ? look.pressed : look.bg,
          borderColor: look.border ?? 'transparent',
          borderWidth: look.border ? 2 : 0,
          opacity: disabled && !loading ? 0.5 : 1,
        },
        style,
      ]}
    >
      <View style={styles.row}>
        {loading ? <ActivityIndicator color={look.text} /> : icon}
        <AppText variant="botao" style={{ color: look.text }}>
          {loading ? (loadingLabel ?? label) : label}
        </AppText>
      </View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    minHeight: TOUCH,
    borderRadius: radius.campo,
    paddingHorizontal: space.l,
    paddingVertical: space.s,
    justifyContent: 'center',
  },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: space.s },
});
