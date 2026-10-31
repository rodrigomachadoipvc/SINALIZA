import { Text, type TextProps } from 'react-native';

import { MAX_FONT_SCALE, type as typography } from '../theme/tokens';

export type TextVariant = keyof typeof typography;

/** Text that follows the type scale and grows with the system text size, up to 200 %. */
export function AppText({
  variant = 'corpo',
  style,
  ...rest
}: TextProps & { variant?: TextVariant }) {
  return (
    <Text maxFontSizeMultiplier={MAX_FONT_SCALE} style={[typography[variant], style]} {...rest} />
  );
}
