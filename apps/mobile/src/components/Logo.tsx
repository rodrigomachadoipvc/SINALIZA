import logoSymbol from '@sinaliza/shared/assets/logo-symbol.svg';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { t } from '../i18n/pt-PT';
import { colors, fonts, space } from '../theme/tokens';
import { AppText } from './AppText';

/**
 * Logo: the shared SVG symbol (packages/shared/assets) next to the wordmark. The wordmark is
 * drawn as text because native image renderers cannot use the app's Poppins font inside an SVG.
 */
export function Logo({ size = 72, light = false }: { size?: number; light?: boolean }) {
  const color = light ? colors.branco : colors.azul;
  return (
    <View
      style={styles.row}
      accessible
      accessibilityRole="image"
      accessibilityLabel={`Sinaliza — ${t.abertura.assinatura}`}
    >
      <Image source={logoSymbol} style={{ width: size, height: size }} contentFit="contain" />
      <View>
        <AppText
          style={{
            fontFamily: fonts.tituloBold,
            fontSize: size * 0.42,
            lineHeight: size * 0.5,
            color,
          }}
        >
          SINALIZA
        </AppText>
        <AppText variant="legenda" style={{ color }}>
          {t.abertura.assinatura}
        </AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.s },
});
