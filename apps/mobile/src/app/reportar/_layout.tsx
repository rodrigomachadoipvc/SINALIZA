import { Redirect, Stack } from 'expo-router';

import { useSession } from '../../auth/session';

/** The report wizard: four steps and the confirmation, outside the tab bar. */
export default function ReportLayout() {
  const status = useSession((s) => s.status);
  if (status !== 'signedIn') return <Redirect href="/login" />;
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="enviada" options={{ gestureEnabled: false }} />
    </Stack>
  );
}
