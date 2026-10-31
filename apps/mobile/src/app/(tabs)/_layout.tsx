import { Redirect, Tabs } from 'expo-router';

import { useSession } from '../../auth/session';
import { TabBar } from '../../components/TabBar';

/** Signed-in area. Losing the session (sign out, expired refresh) returns to sign in. */
export default function TabsLayout() {
  const status = useSession((s) => s.status);
  if (status !== 'signedIn') return <Redirect href="/login" />;
  return (
    <Tabs tabBar={(props) => <TabBar {...props} />} screenOptions={{ headerShown: false }}>
      <Tabs.Screen name="mapa" />
      <Tabs.Screen name="minhas" />
      <Tabs.Screen name="perfil" />
    </Tabs>
  );
}
