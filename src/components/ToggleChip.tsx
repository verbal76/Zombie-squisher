import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';
import { colors, type } from '../ui/theme';

export function ToggleChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={`${label} ${on ? 'on' : 'off'}`}
      style={[styles.chip, on ? styles.on : styles.off]}
    >
      <Text style={[styles.text, !on && styles.textOff]}>{label}: {on ? 'ON' : 'OFF'}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  chip: { minHeight: 48, paddingHorizontal: 10, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: 'rgba(255,196,0,0.12)', borderColor: colors.hazard },
  off: { backgroundColor: 'rgba(80,80,80,0.2)', borderColor: colors.faint },
  text: { ...type.label, color: colors.hazard, fontSize: 12 },
  textOff: { color: colors.dim },
});
