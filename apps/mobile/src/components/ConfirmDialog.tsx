import { Modal, StyleSheet, View } from 'react-native';

import { t } from '../i18n/pt-PT';
import { colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';
import { Button } from './Button';

interface Props {
  visible: boolean;
  title: string;
  message: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  loading?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Confirmation before irreversible actions (D1 discard, D2 cancel, D3 sign out). */
export function ConfirmDialog({
  visible,
  title,
  message,
  confirmLabel,
  cancelLabel = t.comum.cancelar,
  destructive = false,
  loading = false,
  onConfirm,
  onCancel,
}: Props) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.dialog} accessibilityViewIsModal accessibilityRole="alert">
          <AppText variant="h2" accessibilityRole="header">
            {title}
          </AppText>
          <AppText variant="corpo" style={{ color: colors.cinzaTexto }}>
            {message}
          </AppText>
          <View style={styles.actions}>
            <Button
              label={confirmLabel}
              variant={destructive ? 'destructive' : 'primary'}
              onPress={onConfirm}
              loading={loading}
            />
            <Button label={cancelLabel} variant="secondary" onPress={onCancel} disabled={loading} />
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: colors.fundoDialogo,
    justifyContent: 'center',
    padding: space.xl,
  },
  dialog: {
    backgroundColor: colors.branco,
    borderRadius: radius.cartao,
    padding: space.xl,
    gap: space.l,
  },
  actions: { gap: space.m },
});
