import { useRouter } from 'expo-router';
import { ChevronRight, KeyRound, LogOut, type LucideIcon, Pencil } from 'lucide-react-native';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { useMe } from '../../../api/queries';
import { signOut } from '../../../auth/actions';
import { useSession } from '../../../auth/session';
import { AppText } from '../../../components/AppText';
import { ConfirmDialog } from '../../../components/ConfirmDialog';
import { Card, Screen, TopBar } from '../../../components/Layout';
import { t } from '../../../i18n/pt-PT';
import { formatMonthYear, initials } from '../../../lib/format';
import { colors, space, TOUCH } from '../../../theme/tokens';

/** C04 · Profile: personal details, links to edit them and change the password, and sign out (D3). */
export default function Profile() {
  const router = useRouter();
  const sessionUser = useSession((s) => s.session?.user);
  const me = useMe();
  const user = me.data ?? sessionUser;
  const [confirming, setConfirming] = useState(false);
  const [leaving, setLeaving] = useState(false);

  if (!user) return null;

  const leave = async () => {
    setLeaving(true);
    await signOut();
  };

  return (
    <Screen top={<TopBar title={t.perfil.titulo} />}>
      <View style={styles.identity}>
        <View
          style={styles.avatar}
          accessible
          accessibilityRole="image"
          accessibilityLabel={t.perfil.avatar(user.name)}
        >
          <AppText variant="h2" style={{ color: colors.azul }}>
            {initials(user.name)}
          </AppText>
        </View>
        <View style={{ flex: 1 }}>
          <AppText variant="h2" accessibilityRole="header">
            {user.name}
          </AppText>
          <AppText variant="pequeno">{t.perfil.desde(formatMonthYear(user.createdAt))}</AppText>
        </View>
      </View>
      <Card>
        <AppText variant="h3" accessibilityRole="header">
          {t.perfil.dados}
        </AppText>
        <Detail label={t.perfil.nome} value={user.name} />
        <Detail label={t.perfil.email} value={user.email} />
        <Detail label={t.perfil.telemovel} value={user.phone ?? t.perfil.semTelemovel} />
      </Card>
      <Card style={{ padding: 0, gap: 0 }}>
        <Row
          icon={Pencil}
          label={t.perfil.editarDados}
          onPress={() => router.push('/perfil/editar')}
        />
        <Row
          icon={KeyRound}
          label={t.perfil.alterarPalavraPasse}
          onPress={() => router.push('/perfil/palavra-passe')}
        />
        <Row
          icon={LogOut}
          label={t.perfil.terminarSessao}
          onPress={() => setConfirming(true)}
          danger
        />
      </Card>
      <ConfirmDialog
        visible={confirming}
        title={t.perfil.terminarTitulo}
        message={t.perfil.terminarTexto}
        confirmLabel={t.perfil.terminarSessao}
        destructive
        loading={leaving}
        onConfirm={() => void leave()}
        onCancel={() => setConfirming(false)}
      />
    </Screen>
  );
}

function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View accessible style={{ gap: 2 }}>
      <AppText variant="legenda">{label}</AppText>
      <AppText variant="corpo">{value}</AppText>
    </View>
  );
}

function Row({
  icon: Icon,
  label,
  onPress,
  danger = false,
}: {
  icon: LucideIcon;
  label: string;
  onPress: () => void;
  danger?: boolean;
}) {
  const color = danger ? colors.erro : colors.azul;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.row, pressed ? { backgroundColor: colors.cinzaClaro } : null]}
    >
      <Icon size={24} color={color} />
      <AppText variant="corpo" style={{ flex: 1, color }}>
        {label}
      </AppText>
      <ChevronRight size={24} color={colors.cinzaTexto} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.l },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.amarelo,
    alignItems: 'center',
    justifyContent: 'center',
  },
  row: {
    minHeight: TOUCH + space.s,
    flexDirection: 'row',
    alignItems: 'center',
    gap: space.m,
    paddingHorizontal: space.l,
    borderBottomWidth: 1,
    borderBottomColor: colors.cinzaDivisoria,
  },
});
