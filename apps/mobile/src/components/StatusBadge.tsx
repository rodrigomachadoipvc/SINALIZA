import { type OccurrenceStatus, STATUS_LABELS } from '@sinaliza/shared';
import { StyleSheet, View } from 'react-native';

import { colors, radius, space, statusColors } from '../theme/tokens';
import { AppText } from './AppText';
import { STATUS_ICON_COMPONENTS } from './icons';

/** Status label: colour + icon + text, so the status never depends on colour alone. */
export function StatusBadge({ status }: { status: OccurrenceStatus }) {
  const Icon = STATUS_ICON_COMPONENTS[status];
  return (
    <View
      style={[styles.badge, { backgroundColor: statusColors[status] }]}
      accessible
      accessibilityLabel={`Estado: ${STATUS_LABELS[status]}`}
    >
      <Icon size={16} color={colors.branco} strokeWidth={2.5} aria-hidden />
      <AppText variant="legendaForte" style={{ color: colors.branco }}>
        {STATUS_LABELS[status]}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    gap: space.xs,
    paddingHorizontal: space.s,
    paddingVertical: space.xs,
    borderRadius: radius.total,
  },
});
