import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Progress } from '../types';
import { VEHICLES } from '../data/vehicles';
import { WEAPONS, ABILITIES } from '../data/weapons';
import { SIDE_MODS } from '../data/sideMods';
import { AboutModal } from './AboutModal';

interface Props {
  progress: Progress;
  onPlay: () => void;
  onGarage: () => void;
}

export function MenuScreen({ progress, onPlay, onGarage }: Props) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const v = VEHICLES[progress.selectedVehicle];
  const w = WEAPONS[progress.selectedWeapon];
  const a = ABILITIES[progress.selectedAbility];
  const s = SIDE_MODS[progress.selectedSideMod];
  return (
    <View style={styles.root}>
      {/* Gear stays absolute-positioned outside the scroll area so it's
          always reachable regardless of scroll position. */}
      <Pressable style={styles.gear} onPress={() => setAboutOpen(true)} hitSlop={12}>
        <Text style={styles.gearIcon}>⚙</Text>
      </Pressable>

      {/* ScrollView so the menu content is reachable in landscape too --
          in portrait it fits and behaves as a normal centered column;
          in landscape the content overflows ~170px and the player needs
          to scroll down to reach DRIVE / GARAGE. */}
      <ScrollView
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>ZOMBIE</Text>
        <Text style={styles.titleAlt}>SQUISHER</Text>
        <Text style={styles.subtitle}>Drive. Squish. Upgrade.</Text>

        <View style={styles.statBox}>
          <Stat label="Total Kills" value={progress.totalKills.toLocaleString()} />
          <Stat label="Best Run" value={progress.bestRunKills.toLocaleString()} />
        </View>

        <View style={styles.loadout}>
          <Text style={styles.loadoutTitle}>LOADOUT</Text>
          <Text style={styles.loadoutLine}>Vehicle: <Text style={styles.loadoutVal}>{v.name}</Text></Text>
          <Text style={styles.loadoutLine}>Weapon: <Text style={styles.loadoutVal}>{w.name}</Text></Text>
          <Text style={styles.loadoutLine}>Sides: <Text style={styles.loadoutVal}>{s.name}</Text></Text>
          <Text style={styles.loadoutLine}>Ability: <Text style={styles.loadoutVal}>{a.name}</Text></Text>
        </View>

        <Pressable style={styles.playBtn} onPress={onPlay}>
          <Text style={styles.playText}>DRIVE</Text>
        </Pressable>
        <Pressable style={styles.garageBtn} onPress={onGarage}>
          <Text style={styles.garageText}>GARAGE</Text>
        </Pressable>
      </ScrollView>

      <AboutModal visible={aboutOpen} onClose={() => setAboutOpen(false)} />
    </View>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.stat}>
      <Text style={styles.statValue}>{value}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  // flexGrow: 1 + justifyContent center keeps the layout vertically
  // centered when the content fits the viewport, but allows the
  // ScrollView to scroll when it doesn't (e.g., landscape).
  scrollContent: { flexGrow: 1, paddingHorizontal: 24, paddingTop: 48, paddingBottom: 32, alignItems: 'center', justifyContent: 'center' },
  gear: { position: 'absolute', top: 24, right: 20, width: 40, height: 40, borderRadius: 20, backgroundColor: '#1a1a1a', borderWidth: 2, borderColor: '#2a2a2a', alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  gearIcon: { color: '#ffd24a', fontSize: 22, lineHeight: 26 },
  title: { color: '#e34a4a', fontWeight: '900', fontSize: 56, letterSpacing: 4 },
  titleAlt: { color: '#ffd24a', fontWeight: '900', fontSize: 48, letterSpacing: 6, marginTop: -8 },
  subtitle: { color: '#888', marginTop: 6, marginBottom: 24, fontStyle: 'italic' },
  statBox: { flexDirection: 'row', gap: 24, marginBottom: 20 },
  stat: { alignItems: 'center', minWidth: 120 },
  statValue: { color: '#fff', fontSize: 28, fontWeight: '900' },
  statLabel: { color: '#888', fontSize: 12, letterSpacing: 1 },
  loadout: { backgroundColor: '#1a1a1a', padding: 16, borderRadius: 12, width: '100%', maxWidth: 460, marginBottom: 24, borderWidth: 1, borderColor: '#2a2a2a' },
  loadoutTitle: { color: '#888', fontSize: 12, letterSpacing: 2, marginBottom: 8 },
  loadoutLine: { color: '#aaa', marginVertical: 2 },
  loadoutVal: { color: '#fff', fontWeight: '700' },
  playBtn: { backgroundColor: '#e34a4a', paddingHorizontal: 64, paddingVertical: 16, borderRadius: 14, marginBottom: 12 },
  playText: { color: '#fff', fontSize: 24, fontWeight: '900', letterSpacing: 4 },
  garageBtn: { paddingHorizontal: 32, paddingVertical: 12, borderRadius: 10, borderWidth: 2, borderColor: '#ffd24a' },
  garageText: { color: '#ffd24a', fontWeight: '800', letterSpacing: 2 },
});
