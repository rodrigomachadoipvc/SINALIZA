import { Redirect, Stack } from 'expo-router';

import { useSession } from '../../auth/session';

/** Sign-in, register and password recovery; someone already signed in goes to the map. */
export default function AuthLayout() {
  const status = useSession((s) => s.status);
  if (status === 'signedIn') return <Redirect href="/mapa" />;
  return <Stack screenOptions={{ headerShown: false }} />;
}
