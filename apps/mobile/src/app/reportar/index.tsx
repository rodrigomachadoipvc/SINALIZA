import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { Camera, ImageIcon, Trash2 } from 'lucide-react-native';
import { useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet, View } from 'react-native';

import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { WizardScreen } from '../../components/WizardScreen';
import { t } from '../../i18n/pt-PT';
import { compressPhoto, formatMegabytes } from '../../lib/photo';
import { useDraft } from '../../store/draft';
import { colors, radius, space } from '../../theme/tokens';

const tx = t.assistente.fotografia;

/** Step 1 · Optional photo from the camera or the gallery, compressed before it is kept. */
export default function PhotoStep() {
  const router = useRouter();
  const photo = useDraft((s) => s.photo);
  const setPhoto = useDraft((s) => s.setPhoto);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  const next = () => {
    const draft = useDraft.getState();
    if (draft.editingFromReview) {
      draft.setEditingFromReview(false);
      router.back();
    } else router.push('/reportar/categoria');
  };

  const pick = async (source: 'camera' | 'library') => {
    setProblem(null);
    // The browser's file picker needs no permission; on a phone we ask first and explain a refusal.
    if (Platform.OS !== 'web') {
      const permission =
        source === 'camera'
          ? await ImagePicker.requestCameraPermissionsAsync()
          : await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!permission.granted) {
        setProblem(source === 'camera' ? tx.permissaoCamara : tx.permissaoGaleria);
        return;
      }
    }
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    if (!asset) return;
    setBusy(true);
    try {
      setPhoto(await compressPhoto(asset.uri, asset.width, asset.height));
    } catch {
      setProblem(tx.erro);
    } finally {
      setBusy(false);
    }
  };

  return (
    <WizardScreen
      step={1}
      title={tx.titulo}
      onNext={next}
      nextDisabled={!photo || busy}
      extraAction={
        <Button
          label={tx.saltar}
          variant="secondary"
          onPress={next}
          disabled={busy}
          style={{ flex: 1 }}
        />
      }
    >
      <AppText variant="corpo">{tx.explicacao}</AppText>
      {problem ? <Notice kind="error">{problem}</Notice> : null}
      {busy ? (
        <View style={[styles.preview, styles.empty]} accessibilityLiveRegion="polite">
          <ActivityIndicator color={colors.azul} />
          <AppText variant="pequeno">{tx.aPreparar}</AppText>
        </View>
      ) : photo ? (
        <>
          <Image
            source={{ uri: photo.uri }}
            style={styles.preview}
            contentFit="cover"
            accessibilityLabel={tx.preVisualizacao}
          />
          <Notice kind="success">{tx.adicionada(formatMegabytes(photo.sizeBytes))}</Notice>
          <Button
            label={tx.remover}
            variant="text"
            icon={<Trash2 size={20} color={colors.azul} />}
            onPress={() => setPhoto(null)}
          />
        </>
      ) : (
        <View style={[styles.preview, styles.empty]}>
          <ImageIcon size={40} color={colors.cinzaContorno} />
          <AppText variant="pequeno">{tx.vazio}</AppText>
        </View>
      )}
      <Button
        label={tx.tirar}
        icon={<Camera size={20} color={colors.branco} />}
        onPress={() => void pick('camera')}
        disabled={busy}
      />
      <Button
        label={tx.galeria}
        variant="secondary"
        icon={<ImageIcon size={20} color={colors.azul} />}
        onPress={() => void pick('library')}
        disabled={busy}
      />
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  preview: { width: '100%', aspectRatio: 4 / 3, borderRadius: radius.cartao },
  empty: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: space.s,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.cinzaDivisoria,
    backgroundColor: colors.cinzaClaro,
  },
});
