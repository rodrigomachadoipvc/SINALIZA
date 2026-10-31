import { Image } from 'expo-image';
import { type Href, useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '../../api/client';
import { useCategories, useSubmitOccurrence } from '../../api/queries';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Card } from '../../components/Layout';
import { Notice } from '../../components/Notice';
import { WizardScreen } from '../../components/WizardScreen';
import { t } from '../../i18n/pt-PT';
import { validateDetails } from '../../lib/validation';
import { useDraft } from '../../store/draft';
import { radius, space } from '../../theme/tokens';

const tx = t.assistente.rever;

/** Step 4 · Review everything, edit any part, then send the photo and create the occurrence. */
export default function ReviewStep() {
  const router = useRouter();
  const draft = useDraft();
  const categories = useCategories();
  const submit = useSubmitOccurrence();
  const category = categories.data?.find((c) => c.id === draft.categoryId);

  const complete =
    Object.keys(validateDetails(draft.categoryId, draft.description)).length === 0 &&
    draft.location?.inside === true;

  const edit = (href: Href) => {
    draft.setEditingFromReview(true);
    router.push(href);
  };

  const send = () => {
    // On failure the draft stays as it is, so «Submeter» can simply be tried again.
    submit.mutate(useDraft.getState(), {
      onSuccess: (created) =>
        router.replace({ pathname: '/reportar/enviada', params: { id: created.id } }),
    });
  };

  return (
    <WizardScreen
      step={4}
      title={tx.titulo}
      onBack={() => router.back()}
      onNext={send}
      nextLabel={tx.submeter}
      nextLoadingLabel={tx.aEnviar}
      nextLoading={submit.isPending}
      nextDisabled={!complete}
    >
      {submit.isError ? <Notice kind="error">{errorMessage(submit.error)}</Notice> : null}
      <Section title={tx.fotografia} onEdit={() => edit('/reportar')}>
        {draft.photo ? (
          <Image
            source={{ uri: draft.photo.uri }}
            style={styles.photo}
            contentFit="cover"
            accessibilityLabel={t.assistente.fotografia.preVisualizacao}
          />
        ) : (
          <AppText variant="pequeno">{tx.semFotografia}</AppText>
        )}
      </Section>
      <Section title={tx.categoria} onEdit={() => edit('/reportar/categoria')}>
        <AppText variant="corpo">{category?.name ?? '—'}</AppText>
      </Section>
      <Section title={tx.descricao} onEdit={() => edit('/reportar/categoria')}>
        <AppText variant="corpo">{draft.description.trim() || '—'}</AppText>
      </Section>
      <Section title={tx.localizacao} onEdit={() => edit('/reportar/localizacao')}>
        <AppText variant="corpo">{draft.location?.address ?? '—'}</AppText>
      </Section>
      <Notice kind="info">{tx.aviso}</Notice>
    </WizardScreen>
  );
}

function Section({
  title,
  onEdit,
  children,
}: {
  title: string;
  onEdit: () => void;
  children: ReactNode;
}) {
  return (
    <Card>
      <View style={styles.sectionHead}>
        <AppText variant="h3" accessibilityRole="header" style={{ flex: 1 }}>
          {title}
        </AppText>
        <Button
          label={t.comum.editar}
          variant="text"
          onPress={onEdit}
          accessibilityHint={tx.editarCampo(title)}
        />
      </View>
      {children}
    </Card>
  );
}

const styles = StyleSheet.create({
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.s },
  photo: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.campo },
});
