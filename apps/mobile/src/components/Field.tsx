import { CircleAlert, Eye, EyeOff } from 'lucide-react-native';
import { forwardRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  type TextInputInstance,
  type TextInputProps,
  View,
} from 'react-native';

import { t } from '../i18n/pt-PT';
import { colors, fonts, MAX_FONT_SCALE, radius, space, TOUCH } from '../theme/tokens';
import { AppText } from './AppText';

interface FieldProps extends Omit<TextInputProps, 'style'> {
  label: string;
  error?: string | undefined;
  hint?: string | undefined;
  /** Adds the show/hide toggle and hides the text. */
  password?: boolean;
  /** Error border without a message under the field (the message is shown elsewhere). */
  invalid?: boolean;
}

function FieldMessage({ error, hint }: { error?: string | undefined; hint?: string | undefined }) {
  if (error)
    return (
      <View style={styles.message} accessibilityLiveRegion="polite">
        <CircleAlert size={16} color={colors.erro} aria-hidden />
        <AppText variant="pequeno" style={{ color: colors.erro, flex: 1 }}>
          {error}
        </AppText>
      </View>
    );
  return hint ? <AppText variant="legenda">{hint}</AppText> : null;
}

/** Text field: label always visible, 48 px high, error next to it with an icon and text. */
export const TextField = forwardRef<TextInputInstance, FieldProps>(function TextField(
  { label, error, hint, password = false, invalid = false, editable = true, ...rest },
  ref,
) {
  const [hidden, setHidden] = useState(password);
  return (
    <View style={styles.field}>
      <AppText variant="rotulo" nativeID={`${label}-label`}>
        {label}
      </AppText>
      <View
        style={[
          styles.control,
          error || invalid ? styles.controlError : null,
          !editable ? styles.controlDisabled : null,
        ]}
      >
        <TextInput
          ref={ref}
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          aria-invalid={error || invalid ? true : undefined}
          editable={editable}
          secureTextEntry={hidden}
          placeholderTextColor={colors.cinzaTexto}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={styles.input}
          {...rest}
        />
        {password ? (
          <Pressable
            onPress={() => setHidden((h) => !h)}
            accessibilityRole="button"
            accessibilityLabel={hidden ? t.comum.mostrarPalavraPasse : t.comum.ocultarPalavraPasse}
            style={styles.toggle}
          >
            {hidden ? (
              <Eye size={24} color={colors.azul} />
            ) : (
              <EyeOff size={24} color={colors.azul} />
            )}
          </Pressable>
        ) : null}
      </View>
      <FieldMessage error={error} hint={hint} />
    </View>
  );
});

interface TextAreaProps extends FieldProps {
  maxLength: number;
  value: string;
}

/** Multi-line field with a character counter. */
export function TextArea({ label, error, hint, maxLength, value, ...rest }: TextAreaProps) {
  return (
    <View style={styles.field}>
      <AppText variant="rotulo">{label}</AppText>
      <View style={[styles.control, styles.area, error ? styles.controlError : null]}>
        <TextInput
          multiline
          textAlignVertical="top"
          accessibilityLabel={label}
          accessibilityHint={error ?? hint}
          aria-invalid={error ? true : undefined}
          maxLength={maxLength}
          value={value}
          placeholderTextColor={colors.cinzaTexto}
          maxFontSizeMultiplier={MAX_FONT_SCALE}
          style={[styles.input, styles.areaInput]}
          {...rest}
        />
      </View>
      <View style={styles.areaFooter}>
        <View style={{ flex: 1 }}>
          <FieldMessage error={error} hint={hint} />
        </View>
        <AppText variant="legenda">{t.comum.contador(value.length, maxLength)}</AppText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  field: { gap: space.xs },
  control: {
    minHeight: TOUCH,
    flexDirection: 'row',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.cinzaContorno,
    borderRadius: radius.campo,
    backgroundColor: colors.branco,
  },
  controlError: { borderWidth: 2, borderColor: colors.erro },
  controlDisabled: { backgroundColor: colors.cinzaClaro },
  input: {
    flex: 1,
    minHeight: TOUCH,
    paddingHorizontal: space.m,
    fontFamily: fonts.regular,
    fontSize: 16,
    color: colors.azul,
  },
  toggle: { width: TOUCH, height: TOUCH, alignItems: 'center', justifyContent: 'center' },
  area: { alignItems: 'stretch' },
  areaInput: { minHeight: 120, paddingTop: space.m },
  areaFooter: { flexDirection: 'row', gap: space.s, alignItems: 'flex-start' },
  message: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
});
