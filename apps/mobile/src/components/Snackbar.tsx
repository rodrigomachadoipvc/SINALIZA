import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
} from 'react';
import { AccessibilityInfo, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius, space } from '../theme/tokens';
import { AppText } from './AppText';

interface SnackbarContextValue {
  show: (message: string) => void;
}

const SnackbarContext = createContext<SnackbarContextValue | null>(null);

const DURATION_MS = 4000;

/** Short message at the bottom (feedback after saving, cancelling, …), also read aloud. */
export function SnackbarProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState<string | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const insets = useSafeAreaInsets();

  const show = useCallback((text: string) => {
    if (timer.current) clearTimeout(timer.current);
    setMessage(text);
    AccessibilityInfo.announceForAccessibility(text);
    timer.current = setTimeout(() => setMessage(null), DURATION_MS);
  }, []);

  const value = useMemo(() => ({ show }), [show]);

  return (
    <SnackbarContext.Provider value={value}>
      {children}
      {message ? (
        <View
          pointerEvents="none"
          style={[styles.snackbar, { bottom: insets.bottom + 80 }]}
          accessibilityLiveRegion="polite"
        >
          <AppText variant="corpo" style={{ color: colors.branco }}>
            {message}
          </AppText>
        </View>
      ) : null}
    </SnackbarContext.Provider>
  );
}

export function useSnackbar(): SnackbarContextValue {
  const value = useContext(SnackbarContext);
  if (!value) throw new Error('useSnackbar must be used inside SnackbarProvider');
  return value;
}

const styles = StyleSheet.create({
  snackbar: {
    position: 'absolute',
    left: space.l,
    right: space.l,
    backgroundColor: colors.azul,
    borderRadius: radius.campo,
    paddingHorizontal: space.l,
    paddingVertical: space.m,
  },
});
