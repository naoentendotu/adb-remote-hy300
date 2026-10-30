import { useState } from 'react';
import { Platform, StyleSheet, type TextStyle } from 'react-native';
import { TextField, type TextFieldProps } from 'react-native-ui-lib';

import { MONO, radius, useThemed, type Colors } from '@/theme';

/**
 * ui-lib TextField in the app's look: focus only changes the rounded container's border
 * (1 dp outline → 2 dp primary), never an inner box. `mono` for technical values like IPs.
 */
export function Field({ mono, onFocus, onBlur, ...props }: TextFieldProps & { mono?: boolean }) {
  const { colors, styles } = useThemed(makeStyles);
  const [focused, setFocused] = useState(false);
  return (
    <TextField
      placeholderTextColor={colors.textMuted}
      labelStyle={styles.label}
      validationMessageStyle={styles.error}
      enableErrors
      retainValidationSpace={false}
      {...props}
      fieldStyle={[styles.field, focused && styles.fieldFocused]}
      style={[styles.input, NO_OUTLINE, mono && styles.mono]}
      onFocus={(e) => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={(e) => {
        setFocused(false);
        onBlur?.(e);
      }}
    />
  );
}

// The browser draws its own focus box inside the field in the web preview (Android draws none); the
// container border already shows focus. RN's types lack outlineStyle 'none', hence the cast.
const NO_OUTLINE = Platform.select({ web: { outlineStyle: 'none', outlineWidth: 0 } as unknown as TextStyle });

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    label: { color: colors.textMuted, fontSize: 13, marginBottom: 6 },
    // Border width changes by 1 on focus; padding shrinks by the same so the text does not jump.
    field: {
      height: 52,
      borderRadius: radius.sm,
      borderWidth: 1,
      borderColor: colors.outline,
      backgroundColor: colors.surfaceHigh,
      paddingHorizontal: 14,
    },
    fieldFocused: { borderWidth: 2, borderColor: colors.primary, paddingHorizontal: 13 },
    input: { color: colors.text, fontSize: 17 },
    mono: { fontFamily: MONO },
    error: { color: colors.danger, fontSize: 13, lineHeight: 18 },
  });
