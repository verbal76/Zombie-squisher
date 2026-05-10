import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { Progress, UpgradeStats, WeaponId, AbilityId, SideModId } from '../types';
import { VEHICLES, VEHICLE_LIST } from '../data/vehicles';
import { WEAPONS, WEAPON_LIST, ABILITIES, ABILITY_LIST } from '../data/weapons';
import { SIDE_MODS, SIDE_MOD_LIST } from '../data/sideMods';
import { buyUpgrade, buyVehicle, MAX_UPGRADE, upgradeCost } from '../store/progress';

interface Props {
  progress: Progress;
  onChange: (p: Progress) => void;
  onBack: () => void;
}

export function GarageScreen({ progress, onChange, onBack }: Props) {
  return (
    <View style={styles.root}>
      <View style={styles.topBar}>
        <Pressable onPress={onBack} style={styles.backBtn}>
          <Text style={styles.backText}>{'< BACK'}</Text>
        </Pressable>
        <Text style={styles.kills}>{progress.totalKills.toLocaleString()} K</Text>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Section title="VEHICLES">
          {VEHICLE_LIST.map((v) => {
            const owned = progress.unlockedVehicles.includes(v.id);
            const selected = progress.selectedVehicle === v.id;
            const canBuy = !owned && progress.totalKills >= v.killCost;
            return (
              <Pressable
                key={v.id}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => {
                  if (owned) {
                    onChange({ ...progress, selectedVehicle: v.id });
                  } else if (canBuy) {
                    const next = buyVehicle(progress, v.id);
                    if (next) onChange(next);
                  }
                }}
              >
                <View style={[styles.swatch, { backgroundColor: v.color }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{v.name}</Text>
                  <Text style={styles.cardMeta}>
                    SPD {v.baseSpeed} · ARM {v.baseArmor} · HND {v.baseHandling} · ACC {v.baseAcceleration}
                  </Text>
                  {!owned && <Text style={styles.cost}>{v.killCost.toLocaleString()} kills</Text>}
                  {owned && selected && <Text style={styles.selectedTag}>SELECTED</Text>}
                  {owned && !selected && <Text style={styles.tapTag}>tap to select</Text>}
                </View>
                {!owned && <Text style={styles.lockIcon}>🔒</Text>}
              </Pressable>
            );
          })}
        </Section>

        <Section title={`UPGRADE: ${VEHICLES[progress.selectedVehicle].name.toUpperCase()}`}>
          {(['speed', 'armor', 'handling', 'acceleration'] as (keyof UpgradeStats)[]).map((stat) => {
            const lvl = progress.upgrades[progress.selectedVehicle]?.[stat] ?? 0;
            const cost = upgradeCost(lvl);
            const maxed = cost === null;
            const can = !maxed && progress.totalKills >= (cost ?? 0);
            return (
              <Pressable
                key={stat}
                style={styles.upgRow}
                onPress={() => {
                  if (maxed) return;
                  const next = buyUpgrade(progress, progress.selectedVehicle, stat);
                  if (next) onChange(next);
                }}
              >
                <Text style={styles.upgLabel}>{stat.toUpperCase()}</Text>
                <View style={styles.pips}>
                  {Array.from({ length: MAX_UPGRADE }).map((_, i) => (
                    <View key={i} style={[styles.pip, i < lvl && styles.pipFill]} />
                  ))}
                </View>
                <Text style={styles.upgCost}>{maxed ? 'MAX' : `${cost}`}</Text>
              </Pressable>
            );
          })}
        </Section>

        <Section title="WEAPONS">
          {WEAPON_LIST.map((w) => {
            const unlocked = progress.unlockedWeapons.includes(w.id) || progress.totalKills >= w.unlockKills;
            const selected = progress.selectedWeapon === w.id;
            return (
              <Pressable
                key={w.id}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => {
                  if (unlocked) {
                    onChange({
                      ...progress,
                      selectedWeapon: w.id as WeaponId,
                      unlockedWeapons: Array.from(new Set([...progress.unlockedWeapons, w.id as WeaponId])),
                    });
                  }
                }}
              >
                <View style={[styles.swatch, { backgroundColor: '#ffd24a' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{w.name}</Text>
                  <Text style={styles.cardMeta}>{w.description}</Text>
                  {!unlocked && <Text style={styles.cost}>Unlocks at {w.unlockKills} total kills</Text>}
                  {unlocked && selected && <Text style={styles.selectedTag}>EQUIPPED</Text>}
                </View>
                {!unlocked && <Text style={styles.lockIcon}>🔒</Text>}
              </Pressable>
            );
          })}
        </Section>

        <Section title="SIDE MODS">
          {SIDE_MOD_LIST.map((s) => {
            const unlocked = progress.unlockedSideMods.includes(s.id) || progress.totalKills >= s.unlockKills;
            const selected = progress.selectedSideMod === s.id;
            return (
              <Pressable
                key={s.id}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => {
                  if (unlocked) {
                    onChange({
                      ...progress,
                      selectedSideMod: s.id as SideModId,
                      unlockedSideMods: Array.from(new Set([...progress.unlockedSideMods, s.id as SideModId])),
                    });
                  }
                }}
              >
                <View style={[styles.swatch, { backgroundColor: '#bfbfbf' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{s.name}</Text>
                  <Text style={styles.cardMeta}>{s.description}</Text>
                  {!unlocked && <Text style={styles.cost}>Unlocks at {s.unlockKills} total kills</Text>}
                  {unlocked && selected && <Text style={styles.selectedTag}>EQUIPPED</Text>}
                </View>
                {!unlocked && <Text style={styles.lockIcon}>🔒</Text>}
              </Pressable>
            );
          })}
        </Section>

        <Section title="ABILITIES">
          {ABILITY_LIST.map((a) => {
            const unlocked = progress.unlockedAbilities.includes(a.id) || progress.totalKills >= a.unlockKills;
            const selected = progress.selectedAbility === a.id;
            return (
              <Pressable
                key={a.id}
                style={[styles.card, selected && styles.cardSelected]}
                onPress={() => {
                  if (unlocked) {
                    onChange({
                      ...progress,
                      selectedAbility: a.id as AbilityId,
                      unlockedAbilities: Array.from(new Set([...progress.unlockedAbilities, a.id as AbilityId])),
                    });
                  }
                }}
              >
                <View style={[styles.swatch, { backgroundColor: '#4ad1ff' }]} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.cardTitle}>{a.name}</Text>
                  <Text style={styles.cardMeta}>{a.description}</Text>
                  {!unlocked && <Text style={styles.cost}>Unlocks at {a.unlockKills} total kills</Text>}
                  {unlocked && selected && <Text style={styles.selectedTag}>EQUIPPED</Text>}
                </View>
                {!unlocked && <Text style={styles.lockIcon}>🔒</Text>}
              </Pressable>
            );
          })}
        </Section>
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#0a0a0a' },
  topBar: { paddingTop: 50, paddingHorizontal: 16, paddingBottom: 12, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderBottomWidth: 1, borderBottomColor: '#1a1a1a' },
  backBtn: { paddingVertical: 6, paddingHorizontal: 10 },
  backText: { color: '#ffd24a', fontWeight: '800' },
  kills: { color: '#fff', fontWeight: '900', fontSize: 18 },
  scroll: { padding: 16, paddingBottom: 64 },
  section: { marginBottom: 24 },
  sectionTitle: { color: '#888', letterSpacing: 2, marginBottom: 8, fontWeight: '700' },
  card: { flexDirection: 'row', backgroundColor: '#1a1a1a', padding: 12, borderRadius: 10, marginBottom: 8, alignItems: 'center', gap: 12, borderWidth: 2, borderColor: 'transparent' },
  cardSelected: { borderColor: '#ffd24a' },
  lockIcon: { fontSize: 22, color: '#e34a4a', marginLeft: 8, marginRight: 4 },
  swatch: { width: 36, height: 36, borderRadius: 6, borderWidth: 2, borderColor: '#000' },
  cardTitle: { color: '#fff', fontWeight: '800', fontSize: 16 },
  cardMeta: { color: '#888', fontSize: 12, marginTop: 2 },
  cost: { color: '#e34a4a', fontSize: 12, marginTop: 4, fontWeight: '700' },
  selectedTag: { color: '#ffd24a', fontSize: 11, marginTop: 4, fontWeight: '800', letterSpacing: 1 },
  tapTag: { color: '#666', fontSize: 11, marginTop: 4 },
  upgRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: '#1a1a1a', padding: 12, borderRadius: 10, marginBottom: 6, gap: 12 },
  upgLabel: { color: '#fff', fontWeight: '800', width: 80 },
  pips: { flexDirection: 'row', flex: 1, gap: 4 },
  pip: { flex: 1, height: 10, backgroundColor: '#2a2a2a', borderRadius: 3 },
  pipFill: { backgroundColor: '#ffd24a' },
  upgCost: { color: '#e34a4a', fontWeight: '800', minWidth: 50, textAlign: 'right' },
});
