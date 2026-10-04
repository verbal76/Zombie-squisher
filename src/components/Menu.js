import React, { useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { getBuildInfo } from '../buildInfo';

function Button({ label, onPress, primary }) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => [styles.btn, primary && styles.primary, pressed && styles.pressed]}>
      <Text style={styles.btnText}>{label}</Text>
    </Pressable>
  );
}

export default function Menu({ onPlay, best }) {
  const [about, setAbout] = useState(false);
  const info = getBuildInfo();
  if (about) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>About</Text>
        <Text style={styles.body}>{info.name}  v{info.version} (build {info.versionCode})</Text>
        <Text style={styles.body}>Source {info.sourceSha}</Text>
        <Text style={styles.body}>Hot Attic Games</Text>
        <Button label="BACK" onPress={() => setAbout(false)} />
      </View>
    );
  }
  return (
    <View style={styles.root}>
      <Text style={styles.title}>ZOMBIE CRUSHER</Text>
      <Text style={styles.sub}>Drive over zombies. Survive the horde.</Text>
      {best > 0 && <Text style={styles.body}>Best this session: {best} kills</Text>}
      <Button label="PLAY" onPress={onPlay} primary />
      <Button label="ABOUT" onPress={() => setAbout(true)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#1e321e', alignItems: 'center', justifyContent: 'center', gap: 10 },
  title: { color: '#9be564', fontSize: 44, fontWeight: '900', letterSpacing: 2 },
  sub: { color: '#cfe8c0', fontSize: 16, marginBottom: 6 },
  body: { color: '#fff', fontSize: 16 },
  btn: { minWidth: 220, minHeight: 56, borderRadius: 12, backgroundColor: 'rgba(255,255,255,0.15)', alignItems: 'center', justifyContent: 'center' },
  primary: { backgroundColor: '#d9534f' },
  pressed: { opacity: 0.7 },
  btnText: { color: '#fff', fontSize: 20, fontWeight: 'bold' },
});
