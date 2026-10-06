import React from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Progress, UpgradeStats, WeaponId, AbilityId, SideModId } from '../types';
import { VEHICLES, VEHICLE_LIST } from '../data/vehicles';
import { WEAPON_LIST, ABILITY_LIST } from '../data/weapons';
import { SIDE_MOD_LIST } from '../data/sideMods';
import { buyUpgrade, buyVehicle, MAX_UPGRADE, upgradeCost } from '../store/progress';
import { HazardStripe } from '../ui/HazardStripe';
import { colors, type } from '../ui/theme';

interface Props {
  progress: Progress;
  onChange: (p: Progress) => void;
  onBack: () => void;
}

const STATS: (keyof UpgradeStats)[] = ['speed', 'armor', 'handling', 'acceleration'];

export function GarageScreen({ progress, onChange, onBack }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const twoPane = width > height;
  const bank = progress.totalKills;
  const lifetime = progress.lifetimeKills;
  const sel = VEHICLES[progress.selectedVehicle];

  const vehicles = (
    <Section title="VEHICLES">
      {VEHICLE_LIST.map((v) => {
        const owned = progress.unlockedVehicles.includes(v.id);
        const selected = progress.selectedVehicle === v.id;
        const affordable = bank >= v.killCost;
        return (
          <Card
            key={v.id}
            selected={selected}
            locked={!owned}
            swatch={v.color}
            title={v.name}
            meta={`SPD ${v.baseSpeed} · ARM ${v.baseArmor} · HND ${v.baseHandling} · ACC ${v.baseAcceleration}`}
            tag={owned ? (selected ? 'SELECTED' : 'tap to select') : undefined}
            tagTone={owned && selected ? 'good' : 'dim'}
            cost={!owned ? { text: `${v.killCost.toLocaleString()} kills`, affordable } : undefined}
            onPress={() => {
              if (owned) onChange({ ...progress, selectedVehicle: v.id });
              else if (affordable) { const next = buyVehicle(progress, v.id); if (next) onChange(next); }
            }}
          />
        );
      })}
    </Section>
  );

  const rest = (
    <>
      <Section title={`UPGRADE · ${sel.name.toUpperCase()}`}>
        {STATS.map((stat) => {
          const lvl = progress.upgrades[progress.selectedVehicle]?.[stat] ?? 0;
          const cost = upgradeCost(lvl);
          const maxed = cost === null;
          const can = !maxed && bank >= cost;
          return (
            <Pressable
              key={stat}
              accessibilityRole="button"
              accessibilityLabel={`Upgrade ${stat}, ${maxed ? 'maxed' : `costs ${cost} kills`}`}
              style={[styles.upgRow, can && styles.upgRowCan]}
              onPress={() => { if (maxed) return; const next = buyUpgrade(progress, progress.selectedVehicle, stat); if (next) onChange(next); }}
            >
              <Text style={styles.upgLabel}>{stat.toUpperCase()}</Text>
              <View style={styles.pips}>
                {Array.from({ length: MAX_UPGRADE }).map((_, i) => <View key={i} style={[styles.pip, i < lvl && styles.pipFill]} />)}
              </View>
              <Text style={[styles.upgCost, maxed ? styles.upgMax : can ? styles.upgCan : styles.upgNo]}>{maxed ? 'MAX' : `${cost!.toLocaleString()}`}</Text>
            </Pressable>
          );
        })}
      </Section>

      <Section title="WEAPONS">
        {WEAPON_LIST.filter((w) => w.id !== 'none').map((w) => {
          const unlocked = progress.unlockedWeapons.includes(w.id) || lifetime >= w.unlockKills;
          const selected = progress.selectedWeapon === w.id;
          return (
            <Card key={w.id} selected={selected} locked={!unlocked} swatch={colors.hazard} title={w.name} meta={w.description}
              tag={unlocked && selected ? 'EQUIPPED' : undefined} tagTone="good"
              cost={!unlocked ? { text: `Unlocks at ${w.unlockKills.toLocaleString()} lifetime kills`, affordable: false } : undefined}
              onPress={() => { if (unlocked) onChange({ ...progress, selectedWeapon: w.id as WeaponId, unlockedWeapons: Array.from(new Set([...progress.unlockedWeapons, w.id as WeaponId])) }); }} />
          );
        })}
      </Section>

      <Section title="SIDE MODS">
        {SIDE_MOD_LIST.map((s) => {
          const unlocked = progress.unlockedSideMods.includes(s.id) || lifetime >= s.unlockKills;
          const selected = progress.selectedSideMod === s.id;
          return (
            <Card key={s.id} selected={selected} locked={!unlocked} swatch="#bfbfbf" title={s.name} meta={s.description}
              tag={unlocked && selected ? 'EQUIPPED' : undefined} tagTone="good"
              cost={!unlocked ? { text: `Unlocks at ${s.unlockKills.toLocaleString()} lifetime kills`, affordable: false } : undefined}
              onPress={() => { if (unlocked) onChange({ ...progress, selectedSideMod: s.id as SideModId, unlockedSideMods: Array.from(new Set([...progress.unlockedSideMods, s.id as SideModId])) }); }} />
          );
        })}
      </Section>

      <Section title="ABILITIES">
        {ABILITY_LIST.map((a) => {
          const unlocked = progress.unlockedAbilities.includes(a.id) || lifetime >= a.unlockKills;
          const selected = progress.selectedAbility === a.id;
          return (
            <Card key={a.id} selected={selected} locked={!unlocked} swatch={colors.cyan} title={a.name} meta={a.description}
              tag={unlocked && selected ? 'EQUIPPED' : undefined} tagTone="good"
              cost={!unlocked ? { text: `Unlocks at ${a.unlockKills.toLocaleString()} lifetime kills`, affordable: false } : undefined}
              onPress={() => { if (unlocked) onChange({ ...progress, selectedAbility: a.id as AbilityId, unlockedAbilities: Array.from(new Set([...progress.unlockedAbilities, a.id as AbilityId])) }); }} />
          );
        })}
      </Section>
    </>
  );

  return (
    <View style={styles.root}>
      <View style={[styles.topBar, { paddingTop: insets.top + 8, paddingLeft: insets.left + 16, paddingRight: insets.right + 16 }]}>
        <Pressable onPress={onBack} style={styles.backBtn} accessibilityRole="button" accessibilityLabel="Back">
          <Text style={styles.backText}>{'◀ BACK'}</Text>
        </Pressable>
        <Text style={styles.title}>GARAGE</Text>
        <View style={styles.bank}>
          <Text style={styles.bankLabel}>KILL BANK</Text>
          <Text style={styles.bankValue}>{bank.toLocaleString()}</Text>
        </View>
      </View>
      <HazardStripe height={6} />

      {twoPane ? (
        <View style={[styles.panes, { paddingLeft: insets.left + 12, paddingRight: insets.right + 12, paddingBottom: insets.bottom }]}>
          <ScrollView style={styles.pane} contentContainerStyle={styles.scroll}>{vehicles}</ScrollView>
          <ScrollView style={styles.pane} contentContainerStyle={styles.scroll}>{rest}</ScrollView>
        </View>
      ) : (
        <ScrollView contentContainerStyle={[styles.scroll, { paddingBottom: insets.bottom + 48 }]}>{vehicles}{rest}</ScrollView>
      )}
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

function Card({ title, meta, swatch, selected, locked, tag, tagTone, cost, onPress }: {
  title: string; meta: string; swatch: string; selected: boolean; locked: boolean; tag?: string; tagTone?: 'good' | 'dim';
  cost?: { text: string; affordable: boolean }; onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected, disabled: locked && !cost?.affordable }}
      style={[styles.card, selected && styles.cardSelected, locked && styles.cardLocked]}
    >
      <View style={[styles.swatch, { backgroundColor: swatch }]} />
      <View style={{ flex: 1 }}>
        <Text style={styles.cardTitle}>{title}</Text>
        <Text style={styles.cardMeta}>{meta}</Text>
        {cost && <Text style={[styles.cost, cost.affordable && styles.costOk]}>{cost.affordable ? `BUY · ${cost.text}` : cost.text}</Text>}
        {tag && <Text style={[styles.tag, tagTone === 'good' ? styles.tagGood : styles.tagDim]}>{tag}</Text>}
      </View>
      {locked && <Text style={styles.lockIcon}>🔒</Text>}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  topBar: { paddingBottom: 8, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  backBtn: { minHeight: 44, minWidth: 90, justifyContent: 'center' },
  backText: { ...type.label, color: colors.hazard, fontSize: 14 },
  title: { ...type.title, color: colors.text, fontSize: 22 },
  bank: { alignItems: 'flex-end', minWidth: 90 },
  bankLabel: { ...type.label, color: colors.dim, fontSize: 10 },
  bankValue: { ...type.number, color: colors.hazard, fontSize: 22 },
  panes: { flex: 1, flexDirection: 'row', gap: 12 },
  pane: { flex: 1 },
  scroll: { paddingVertical: 12, paddingHorizontal: 4, paddingBottom: 48 },
  section: { marginBottom: 18 },
  sectionTitle: { ...type.label, color: colors.dim, fontSize: 12, marginBottom: 8, letterSpacing: 2.5 },
  card: { flexDirection: 'row', backgroundColor: colors.panelSolid, padding: 10, borderRadius: 10, marginBottom: 8, alignItems: 'center', gap: 12, borderWidth: 2, borderColor: colors.edge, minHeight: 64 },
  cardSelected: { borderColor: colors.hazard, backgroundColor: '#241d12' },
  cardLocked: { opacity: 0.85 },
  lockIcon: { fontSize: 20, marginLeft: 4 },
  swatch: { width: 34, height: 34, borderRadius: 6, borderWidth: 2, borderColor: '#000' },
  cardTitle: { color: colors.text, ...type.number, fontSize: 15 },
  cardMeta: { color: colors.dim, fontSize: 12, marginTop: 2 },
  cost: { color: colors.danger, fontSize: 12, marginTop: 3, fontWeight: '800' },
  costOk: { color: colors.ok },
  tag: { fontSize: 11, marginTop: 3, fontWeight: '800', letterSpacing: 1 },
  tagGood: { color: colors.hazard },
  tagDim: { color: colors.faint, fontWeight: '600' },
  upgRow: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.panelSolid, padding: 10, borderRadius: 10, marginBottom: 6, gap: 12, borderWidth: 2, borderColor: colors.edge, minHeight: 52 },
  upgRowCan: { borderColor: colors.hazardDim },
  upgLabel: { color: colors.text, ...type.number, fontSize: 13, width: 104 },
  pips: { flexDirection: 'row', flex: 1, gap: 4 },
  pip: { flex: 1, height: 10, backgroundColor: '#2a241e', borderRadius: 3 },
  pipFill: { backgroundColor: colors.hazard },
  upgCost: { ...type.number, fontSize: 14, minWidth: 56, textAlign: 'right' },
  upgNo: { color: colors.danger },
  upgCan: { color: colors.ok },
  upgMax: { color: colors.hazard },
});
