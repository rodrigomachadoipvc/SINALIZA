import { useNavigation, useRouter } from 'expo-router';
import { type ReactNode, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { t } from '../i18n/pt-PT';
import { hasDraftContent, useDraft } from '../store/draft';
import { space } from '../theme/tokens';
import { Button } from './Button';
import { ConfirmDialog } from './ConfirmDialog';
import { Screen, ScreenTitle, TopBar } from './Layout';
import { StepIndicator } from './Wizard';

/** Leaves the wizard (the whole modal, from any step) and drops the draft. */
export function useCloseWizard() {
  const router = useRouter();
  const navigation = useNavigation();
  return () => {
    useDraft.getState().reset();
    // The wizard's own stack lives inside the root stack; popping the parent closes the modal.
    const root = navigation.getParent();
    if (root?.canGoBack()) root.goBack();
    else router.replace('/mapa');
  };
}

/**
 * Frame shared by the four steps: top bar with «X» (D1 when something was filled in), «Passo X
 * de 4», scrolling content and the fixed «Voltar» / «Continuar» bar.
 */
export function WizardScreen({
  step,
  title,
  children,
  onBack,
  onNext,
  nextLabel = t.comum.continuar,
  nextLoadingLabel,
  nextDisabled = false,
  nextLoading = false,
  extraAction,
  scroll = true,
}: {
  step: 1 | 2 | 3 | 4;
  title: string;
  children: ReactNode;
  onBack?: () => void;
  onNext: () => void;
  nextLabel?: string;
  nextLoadingLabel?: string;
  nextDisabled?: boolean;
  nextLoading?: boolean;
  extraAction?: ReactNode;
  scroll?: boolean;
}) {
  const close = useCloseWizard();
  const [confirming, setConfirming] = useState(false);

  const requestClose = () => {
    if (hasDraftContent(useDraft.getState())) setConfirming(true);
    else close();
  };

  return (
    <Screen
      scroll={scroll}
      top={
        <>
          <TopBar title={title} onClose={requestClose} closeLabel={t.assistente.fechar} />
          <StepIndicator step={step} />
        </>
      }
      footer={
        <View style={styles.footer}>
          {onBack ? (
            <Button
              label={t.comum.voltar}
              variant="secondary"
              onPress={onBack}
              style={styles.button}
            />
          ) : (
            extraAction
          )}
          <Button
            label={nextLabel}
            loadingLabel={nextLoadingLabel}
            onPress={onNext}
            disabled={nextDisabled}
            loading={nextLoading}
            variant="highlight"
            style={styles.button}
          />
        </View>
      }
    >
      {scroll ? <ScreenTitle>{title}</ScreenTitle> : null}
      {children}
      <ConfirmDialog
        visible={confirming}
        title={t.assistente.descartarTitulo}
        message={t.assistente.descartarTexto}
        confirmLabel={t.assistente.descartar}
        cancelLabel={t.assistente.continuarAEditar}
        destructive
        onConfirm={() => {
          setConfirming(false);
          close();
        }}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  footer: { flex: 1, flexDirection: 'row', gap: space.m },
  button: { flex: 1 },
});
