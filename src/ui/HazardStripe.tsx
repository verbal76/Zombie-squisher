import React from 'react';
import { StyleProp, StyleSheet, View, ViewStyle } from 'react-native';
import { colors } from './theme';

const BAR_W = 10;
const GAP = 12;
const COUNT = 90;   // covers ~2000 px; the container clips

/** Diagonal yellow/black hazard stripe used as a framing accent. */
export function HazardStripe({ height = 8, style }: { height?: number; style?: StyleProp<ViewStyle> }) {
  return (
    <View style={[styles.box, { height }, style]} pointerEvents="none">
      <View style={styles.row}>
        {Array.from({ length: COUNT }, (_, i) => (
          <View key={i} style={[styles.bar, { height, marginRight: GAP }]} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: { overflow: 'hidden', backgroundColor: '#15110d', alignSelf: 'stretch' },
  row: { flexDirection: 'row', marginLeft: -12 },
  bar: { width: BAR_W, backgroundColor: colors.hazard, transform: [{ skewX: '-35deg' }] },
});
