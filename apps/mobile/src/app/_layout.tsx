// Per-weight imports, so only the five weights used are bundled (the package index has all 18).
import { Inter_400Regular } from '@expo-google-fonts/inter/400Regular';
import { Inter_500Medium } from '@expo-google-fonts/inter/500Medium';
import { Inter_600SemiBold } from '@expo-google-fonts/inter/600SemiBold';
import { Poppins_600SemiBold } from '@expo-google-fonts/poppins/600SemiBold';
import { Poppins_700Bold } from '@expo-google-fonts/poppins/700Bold';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { ApiError } from '../api/client';
import { useSession } from '../auth/session';
import { SnackbarProvider } from '../components/Snackbar';
import { colors } from '../theme/tokens';

void SplashScreen.preventAutoHideAsync();

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        // Client errors (404, 403…) will not change by retrying; network errors might.
        retry: (count, error) =>
          count < 2 && !(error instanceof ApiError && error.status >= 400 && error.status < 500),
      },
    },
  });
}

export default function RootLayout() {
  const [client] = useState(createQueryClient);
  const [fontsLoaded] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Poppins_600SemiBold,
    Poppins_700Bold,
  });
  const restore = useSession((s) => s.restore);

  useEffect(() => {
    void restore();
  }, [restore]);

  useEffect(() => {
    if (fontsLoaded) void SplashScreen.hideAsync();
  }, [fontsLoaded]);

  if (!fontsLoaded) return null;

  return (
    <SafeAreaProvider>
      <QueryClientProvider client={client}>
        <SnackbarProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.branco } }}
          >
            <Stack.Screen name="index" />
            <Stack.Screen name="(auth)" />
            <Stack.Screen name="(tabs)" />
            <Stack.Screen
              name="reportar"
              options={{ presentation: 'fullScreenModal', gestureEnabled: false }}
            />
          </Stack>
        </SnackbarProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
