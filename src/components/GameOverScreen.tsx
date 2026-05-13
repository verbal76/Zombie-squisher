import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Progress } from '../types';
import { WEAPONS, ABILITIES } from '../data/weapons';
import { SIDE_MODS } from '../data/sideMods';

interface Props {
  kills: number;
  beforeProgress: Progress;
  afterProgress: Progress;
  onRetry: () => void;
  onMenu: () => void;
}

export function GameOverScreen({ kills, beforeProgress, afterProgress, onRetry, onMenu }: Props) {
  const newWeapons = afterProgress.unlockedWeapons.filter((w) => !beforeProgress.unlockedWeapons.includes(w));
  const newAbilities = afterProgress.unlockedAbilities.filter((a) => !beforeProgress.unlockedAbilities.includes(a));
  const newSideMods = afterProgress.unlockedSideMods.filter((s) => !beforeProgress.unlockedSideMods.includes(s));
  const isBest = kills > beforeProgress.bestRunKills;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.scrollContent}
      showsVerticalScrollIndicator={false}
    >
      <Text style={styles.title}>WIPED OUT</Text>
      <Text style={styles.kills}>{kills.toLocaleString()}</Text>
      <Text style={styles.killsLabel}>ZOMBIES SQUISHED</Text>
      {isBest && <Text style={styles.best}>NEW PERSONAL BEST</Text>}

      {(newWeapons.length > 0 || newAbilities.length > 0 || newSideMods.length > 0) && (
        <View style={styles.unlocks}>
          <Text style={styles.unlocksTitle}>UNLOCKED</Text>
          {newWeapons.map((w) => (
            <Text key={w} style={styles.unlockLine}>+ {WEAPONS[w].name}</Text>
          ))}
          {newSideMods.map((s) => (
            <Text key={s} style={styles.unlockLine}>+ {SIDE_MODS[s].name}</Text>
          ))}
          {newAbilities.map((a) => (
            <Text key={a} style={styles.unlockLine}>+ {ABILITIES[a].name}</Text>
          ))}
        </View>
      )}

      <Text style={styles.hint}>Spend your kills in the Garage to upgrade between runs.</Text>

      <View style={styles.btns}>
        <Pressable style={styles.retry} onPress={onRetry}>
          <Text style={styles.retryText}>DRIVE AGAIN</Text>
        </Pressable>
        <Pressable style={styles.menu} onPress={onMenu}>
          <Text style={styles.menuText}>GARAGE</Text>
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  scrollContent: { flexGrow: 1, padding: 24, alignItems: 'center', justifyContent: 'center' },
  title: { color: '#e34a4a', fontWeight: '900', fontSize: 40, letterSpacing: 4, marginBottom: 24 },
  kills: { color: '#ffd24a', fontWeight: '900', fontSize: 72 },
  killsLabel: { color: '#888', letterSpacing: 2, marginTop: -4, marginBottom: 20 },
  best: { color: '#4ad1ff', fontWeight: '800', letterSpacing: 2, marginBottom: 16 },
  unlocks: { backgroundColor: '#1a1a1a', padding: 16, borderRadius: 12, marginBottom: 16, minWidth: 240 },
  unlocksTitle: { color: '#888', letterSpacing: 2, marginBottom: 8, textAlign: 'center' },
  unlockLine: { color: '#ffd24a', textAlign: 'center', fontWeight: '700', marginVertical: 2 },
  hint: { color: '#888', textAlign: 'center', marginBottom: 20, paddingHorizontal: 16 },
  btns: { flexDirection: 'row', gap: 12 },
  retry: { backgroundColor: '#e34a4a', paddingHorizontal: 32, paddingVertical: 14, borderRadius: 12 },
  retryText: { color: '#fff', fontWeight: '900', letterSpacing: 2 },
  menu: { paddingHorizontal: 24, paddingVertical: 14, borderRadius: 12, borderWidth: 2, borderColor: '#ffd24a' },
  menuText: { color: '#ffd24a', fontWeight: '800', letterSpacing: 2 },
});
