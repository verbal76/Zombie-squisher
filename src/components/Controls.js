import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

// Large thumb-friendly buttons; hold to activate.
function Btn({ label, onChange, style }) {
  return (
    <View
      style={[styles.btn, style]}
      onStartShouldSetResponder={() => true}
      onResponderGrant={() => onChange(true)}
      onResponderRelease={() => onChange(false)}
      onResponderTerminate={() => onChange(false)}
    >
      <Text style={styles.label}>{label}</Text>
    </View>
  );
}

export default function Controls({ input, insets = { bottom: 0, left: 0, right: 0 } }) {
  return (
    <>
      <View style={[styles.row, { left: insets.left + 16, bottom: insets.bottom + 16 }]} pointerEvents="box-none">
        <Btn label="◀" onChange={(v) => (input.left = v)} />
        <Btn label="▶" onChange={(v) => (input.right = v)} />
      </View>
      <View style={[styles.row, { right: insets.right + 16, bottom: insets.bottom + 16 }]} pointerEvents="box-none">
        <Btn label="BRAKE" onChange={(v) => (input.brake = v)} />
        <Btn label="GAS" onChange={(v) => (input.gas = v)} style={styles.gas} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  row: { position: 'absolute', bottom: 16, flexDirection: 'row', gap: 12 },
  btn: { width: 96, height: 96, borderRadius: 48, backgroundColor: 'rgba(255,255,255,0.18)', alignItems: 'center', justifyContent: 'center' },
  gas: { backgroundColor: 'rgba(80,200,80,0.35)' },
  label: { color: '#fff', fontWeight: 'bold', fontSize: 18 },
});
