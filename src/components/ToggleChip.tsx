import React from 'react';
import { Pressable, StyleSheet, Text } from 'react-native';

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
  chip: { minHeight: 44, paddingHorizontal: 14, borderRadius: 10, borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  on: { backgroundColor: 'rgba(255,210,74,0.15)', borderColor: '#ffd24a' },
  off: { backgroundColor: 'rgba(80,80,80,0.2)', borderColor: '#555' },
  text: { color: '#ffd24a', fontWeight: '800', letterSpacing: 1, fontSize: 12 },
  textOff: { color: '#888' },
});
