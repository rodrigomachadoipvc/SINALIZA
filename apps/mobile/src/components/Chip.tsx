import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet } from 'react-native';

import { colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';

/** Filter chip: 36 dp visible, 48 dp touch area (hitSlop), check mark when selected. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      hitSlop={{ top: 6, bottom: 6 }}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected }}
      style={({ pressed }) => [
        styles.chip,
        selected ? styles.selected : styles.idle,
        pressed && !selected ? { backgroundColor: colors.cinzaClaro } : null,
      ]}
    >
      {selected ? <Check size={16} color={colors.branco} strokeWidth={2.5} /> : null}
      <AppText variant="rotulo" style={{ color: selected ? colors.branco : colors.azul }}>
        {label}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: {
    height: 36,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.xs,
    paddingHorizontal: space.m,
    borderRadius: radius.total,
    borderWidth: 1,
  },
  selected: { backgroundColor: colors.azul, borderColor: colors.azul },
  idle: { backgroundColor: colors.branco, borderColor: colors.cinzaContorno },
});
