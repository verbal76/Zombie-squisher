import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from './theme';

/** Dark metal plate with a hazard-yellow left edge: the shared panel look. */
export function Plate({ children, style, accent = colors.hazard }: { children: React.ReactNode; style?: StyleProp<ViewStyle>; accent?: string }) {
  return <View style={[styles.plate, { borderLeftColor: accent }, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  plate: { backgroundColor: colors.panelSolid, borderRadius: 8, borderWidth: 1, borderColor: colors.edge, borderLeftWidth: 4, padding: 12 },
});
