import { Check } from 'lucide-react-native';
import { Pressable, StyleSheet, View } from 'react-native';

import { t } from '../i18n/pt-PT';
import { colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';
import { CategoryIcon } from './icons';

/** «Passo X de 4» with a 4-segment bar. */
export function StepIndicator({ step }: { step: 1 | 2 | 3 | 4 }) {
  return (
    <View
      style={styles.steps}
      accessible
      accessibilityRole="progressbar"
      accessibilityLabel={t.assistente.passo(step)}
      accessibilityValue={{ min: 1, max: 4, now: step }}
    >
      <AppText variant="legendaForte" style={{ color: colors.ambar }}>
        {t.assistente.passo(step)}
      </AppText>
      <View style={styles.bar}>
        {[1, 2, 3, 4].map((n) => (
          <View
            key={n}
            style={[
              styles.segment,
              { backgroundColor: n <= step ? colors.amarelo : colors.cinzaDivisoria },
            ]}
          />
        ))}
      </View>
    </View>
  );
}

/** Category option: 56 dp, 2 px blue outline and a check when selected. */
export function CategoryOption({
  name,
  icon,
  selected,
  onPress,
}: {
  name: string;
  icon: string;
  selected: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityLabel={name}
      accessibilityState={{ checked: selected }}
      style={({ pressed }) => [
        styles.option,
        selected ? styles.optionSelected : null,
        pressed ? { backgroundColor: colors.cinzaClaro } : null,
      ]}
    >
      <View style={styles.optionIcon}>
        <CategoryIcon name={icon} />
      </View>
      <AppText variant="corpo" style={{ flex: 1 }}>
        {name}
      </AppText>
      {selected ? (
        <View style={styles.check}>
          <Check size={16} color={colors.branco} strokeWidth={3} />
        </View>
      ) : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  steps: {
    gap: space.s,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
    backgroundColor: colors.branco,
  },
  bar: { flexDirection: 'row', gap: space.xs },
  segment: { flex: 1, height: 4, borderRadius: 2 },
  option: {
    minHeight: 56,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.m,
    borderRadius: radius.campo,
    borderWidth: 1,
    borderColor: colors.cinzaDivisoria,
    backgroundColor: colors.branco,
  },
  optionSelected: {
    borderWidth: 2,
    borderColor: colors.azul,
    backgroundColor: colors.superficieInfo,
  },
  optionIcon: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.cinzaClaro,
  },
  check: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.azul,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
