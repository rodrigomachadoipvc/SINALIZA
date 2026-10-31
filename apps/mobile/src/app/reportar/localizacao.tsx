import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { LocateFixed } from 'lucide-react-native';
import { useCallback, useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { errorMessage } from '../../api/client';
import { validateLocation } from '../../api/queries';
import { AppText } from '../../components/AppText';
import { Button } from '../../components/Button';
import { Notice } from '../../components/Notice';
import { WizardScreen } from '../../components/WizardScreen';
import { BARCELOS } from '../../config';
import { t } from '../../i18n/pt-PT';
import { SinalizaMap } from '../../map/SinalizaMap';
import type { LatLng } from '../../map/types';
import { useDraft } from '../../store/draft';
import { colors, radius, space } from '../../theme/tokens';

const tx = t.assistente.localizacao;

type Phase = 'locating' | 'gpsRefused' | 'ready';

/** The phone's position, or null when the permission is refused or GPS fails. */
async function currentPosition(): Promise<LatLng | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (!permission.granted) return null;
    const { coords } = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
    return { lat: coords.latitude, lng: coords.longitude };
  } catch {
    return null;
  }
}

/**
 * Step 3 · Where the problem is. Starts at the phone's position (or the town centre when GPS is
 * refused); every pin move asks the API for the address and whether it is inside Barcelos.
 */
export default function LocationStep() {
  const router = useRouter();
  const saved = useDraft((s) => s.location);
  const setLocation = useDraft((s) => s.setLocation);
  const [phase, setPhase] = useState<Phase>(saved ? 'ready' : 'locating');
  const [marker, setMarker] = useState<LatLng | null>(
    saved ? { lat: saved.lat, lng: saved.lng } : null,
  );
  const [checking, setChecking] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const latest = useRef(0);

  const check = useCallback(
    async (position: LatLng) => {
      setMarker(position);
      setChecking(true);
      setFailure(null);
      const call = ++latest.current;
      try {
        const result = await validateLocation(position.lat, position.lng);
        // Ignore answers to older pin positions.
        if (call === latest.current) setLocation({ ...position, ...result });
      } catch (error) {
        if (call === latest.current) {
          setLocation(null);
          setFailure(errorMessage(error));
        }
      } finally {
        if (call === latest.current) setChecking(false);
      }
    },
    [setLocation],
  );

  /** Without a GPS position the pin starts at the town centre and the person moves it. */
  const startAt = useCallback(
    (position: LatLng | null) => {
      setPhase(position ? 'ready' : 'gpsRefused');
      void check(position ?? { lat: BARCELOS.lat, lng: BARCELOS.lng });
    },
    [check],
  );

  useEffect(() => {
    if (useDraft.getState().location) return;
    let active = true;
    void currentPosition().then((position) => {
      if (active) startAt(position);
    });
    return () => {
      active = false;
    };
  }, [startAt]);

  const locate = () => {
    setPhase('locating');
    void currentPosition().then(startAt);
  };

  const next = () => {
    const draft = useDraft.getState();
    if (draft.editingFromReview) {
      draft.setEditingFromReview(false);
      router.back();
    } else router.push('/reportar/rever');
  };

  const back = () => {
    useDraft.getState().setEditingFromReview(false);
    router.back();
  };

  const outside = saved !== null && !saved.inside && !checking;

  return (
    <WizardScreen
      step={3}
      title={tx.titulo}
      onBack={back}
      onNext={next}
      nextDisabled={phase === 'locating' || checking || !saved?.inside}
    >
      {phase === 'locating' ? (
        <Notice kind="info">{tx.aObter}</Notice>
      ) : phase === 'gpsRefused' ? (
        <Notice kind="warning">{tx.gpsRecusado}</Notice>
      ) : (
        <AppText variant="pequeno">{tx.dica}</AppText>
      )}
      <SinalizaMap
        style={styles.map}
        center={marker ?? BARCELOS}
        zoom={marker ? 17 : BARCELOS.zoom}
        accessibilityLabel={tx.mapa}
        marker={marker}
        onMarkerChange={(p) => void check(p)}
      />
      <View style={styles.address} accessibilityLiveRegion="polite">
        <AppText variant="rotulo">{tx.morada}</AppText>
        {checking || phase === 'locating' ? (
          <View accessibilityLabel={tx.aValidar}>
            <View style={[styles.bone, { width: '85%' }]} />
            <View style={[styles.bone, { width: '50%' }]} />
          </View>
        ) : (
          <AppText variant="corpo">{saved?.address ?? '—'}</AppText>
        )}
      </View>
      {failure ? <Notice kind="error">{failure}</Notice> : null}
      {saved && !checking ? (
        saved.inside ? (
          <Notice kind="success">{tx.dentro}</Notice>
        ) : (
          <Notice kind="error">{tx.fora}</Notice>
        )
      ) : null}
      {outside || phase === 'gpsRefused' ? (
        <Button
          label={tx.usarMinha}
          variant="secondary"
          icon={<LocateFixed size={20} color={colors.azul} />}
          onPress={locate}
        />
      ) : null}
    </WizardScreen>
  );
}

const styles = StyleSheet.create({
  map: { height: 320, borderRadius: radius.cartao },
  address: { gap: space.xs },
  bone: {
    height: 14,
    borderRadius: 7,
    backgroundColor: colors.cinzaDivisoria,
    marginTop: space.xs,
  },
});
