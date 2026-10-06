import React from 'react';
import { Pressable, StyleProp, StyleSheet, Text, ViewStyle } from 'react-native';
import { colors, type } from './theme';

type Variant = 'primary' | 'secondary' | 'danger';

/** The one button style used by every screen (min 48 px tall touch target). */
export function Button({ label, onPress, variant = 'secondary', big, style, accessibilityLabel }: {
  label: string; onPress: () => void; variant?: Variant; big?: boolean; style?: StyleProp<ViewStyle>; accessibilityLabel?: string;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel ?? label}
      style={({ pressed }) => [styles.base, big && styles.big, variantStyle[variant], pressed && styles.pressed, style]}
    >
      <Text style={[styles.text, big && styles.textBig, variant === 'secondary' ? styles.textSecondary : styles.textSolid]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: { minHeight: 48, minWidth: 120, paddingHorizontal: 20, borderRadius: 10, alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderBottomWidth: 4 },
  big: { minHeight: 60, minWidth: 240, borderRadius: 12 },
  pressed: { opacity: 0.75, transform: [{ translateY: 2 }] },
  text: { ...type.title, fontSize: 16, letterSpacing: 2 },
  textBig: { fontSize: 24, letterSpacing: 5 },
  textSolid: { color: '#15110d' },
  textSecondary: { color: colors.hazard },
});
const variantStyle: Record<Variant, object> = {
  primary: { backgroundColor: colors.hazard, borderColor: '#b38a00' },
  danger: { backgroundColor: colors.rust, borderColor: '#8f330e' },
  secondary: { backgroundColor: 'rgba(255,196,0,0.08)', borderColor: colors.hazardDim },
};
