import { OCCURRENCE_DESCRIPTION_MAX } from '@sinaliza/shared';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, View } from 'react-native';

import { errorMessage } from '../../api/client';
import { useCategories } from '../../api/queries';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { TextArea } from '../../components/Field';
import { Notice } from '../../components/Notice';
import { CategoryOption } from '../../components/Wizard';
import { WizardScreen } from '../../components/WizardScreen';
import { t } from '../../i18n/pt-PT';
import { validateDetails } from '../../lib/validation';
import { useDraft } from '../../store/draft';
import { colors, space } from '../../theme/tokens';

const tx = t.assistente.categoria;

/** Step 2 · Category and description (10–500 characters). */
export default function CategoryStep() {
  const router = useRouter();
  const draft = useDraft();
  const categories = useCategories();
  const [categoryId, setCategoryId] = useState(draft.categoryId);
  const [description, setDescription] = useState(draft.description);
  const [tried, setTried] = useState(false);

  const errors = validateDetails(categoryId, description);
  const hasErrors = Boolean(errors.category ?? errors.description);

  const next = () => {
    setTried(true);
    if (hasErrors || !categoryId) return;
    draft.setDetails(categoryId, description);
    if (draft.editingFromReview) {
      draft.setEditingFromReview(false);
      router.back();
    } else router.push('/reportar/localizacao');
  };

  const back = () => {
    // Keep what was typed when going back, even if it is not valid yet.
    useDraft.setState({ categoryId, description, editingFromReview: false });
    router.back();
  };

  return (
    <WizardScreen
      step={2}
      title={tx.titulo}
      onBack={back}
      onNext={next}
      nextDisabled={tried && hasErrors}
    >
      {tried && hasErrors ? <Notice kind="error">{t.comum.obrigatorioCorrigir}</Notice> : null}
      <View
        style={{ gap: space.s }}
        accessibilityRole="radiogroup"
        accessibilityLabel={tx.categorias}
      >
        <AppText variant="rotulo">{tx.categorias}</AppText>
        {categories.isPending ? <ActivityIndicator color={colors.azul} /> : null}
        {categories.isError ? (
          <>
            <Notice kind="error">{errorMessage(categories.error)}</Notice>
            <Button label={t.comum.tentarNovamente} onPress={() => void categories.refetch()} />
          </>
        ) : null}
        {(categories.data ?? [])
          .filter((c) => c.active)
          .map((c) => (
            <CategoryOption
              key={c.id}
              name={c.name}
              icon={c.icon}
              selected={c.id === categoryId}
              onPress={() => setCategoryId(c.id)}
            />
          ))}
        {tried && errors.category ? (
          <AppText variant="pequeno" style={{ color: colors.erro }}>
            {errors.category}
          </AppText>
        ) : null}
      </View>
      <TextArea
        label={tx.descricao}
        placeholder={tx.placeholder}
        value={description}
        onChangeText={setDescription}
        maxLength={OCCURRENCE_DESCRIPTION_MAX}
        error={tried ? errors.description : undefined}
      />
    </WizardScreen>
  );
}
