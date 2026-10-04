import React, { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Progress } from '../types';
import { VEHICLES } from '../data/vehicles';
import { WEAPONS, ABILITIES } from '../data/weapons';
import { SIDE_MODS } from '../data/sideMods';
import { Settings } from '../store/settingsLogic';
import { AboutModal } from './AboutModal';
import { ToggleChip } from './ToggleChip';
import { Button } from '../ui/Button';
import { Plate } from '../ui/Plate';
import { HazardStripe } from '../ui/HazardStripe';
import { colors, type } from '../ui/theme';

interface Props {
  progress: Progress;
  onPlay: () => void;
  onGarage: () => void;
  settings: Settings;
  onSettings: (s: Settings) => void;
}

export function MenuScreen({ progress, onPlay, onGarage, settings, onSettings }: Props) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = width > height;
  // Scale type and the right-hand column with the screen so nothing leaves it on small phones (640 px wide and up).
  const k = Math.max(0.7, Math.min(1, (width - insets.left - insets.right) / 860));
  const rightW = Math.round(Math.min(340, (width - insets.left - insets.right) * 0.46));
  const v = VEHICLES[progress.selectedVehicle];
  const w = WEAPONS[progress.selectedWeapon];
  const a = ABILITIES[progress.selectedAbility];
  const s = SIDE_MODS[progress.selectedSideMod];
  return (
    <View style={styles.root}>
      <HazardStripe height={10} />
      {/* About stays outside the scroll area so it is always reachable. */}
      <Pressable style={[styles.gear, { top: insets.top + 18, right: insets.right + 16 }]} onPress={() => setAboutOpen(true)} hitSlop={10} accessibilityLabel="About">
        <Text style={styles.gearIcon}>⚙</Text>
      </Pressable>

      <ScrollView
        contentContainerStyle={[
          styles.scroll,
          { paddingTop: insets.top + 58, paddingBottom: insets.bottom + 18, paddingLeft: insets.left + 24, paddingRight: insets.right + 24 },
        ]}
        showsVerticalScrollIndicator={false}
      >
        {/* Landscape (the game's orientation): two columns so DRIVE is always on screen. */}
        <View style={landscape ? styles.rowLayout : styles.colLayout}>
          <View style={styles.col}>
            <Text style={[styles.title, { fontSize: 56 * k, letterSpacing: 6 * k }]}>ZOMBIE</Text>
            <Text style={[styles.titleAlt, { fontSize: 46 * k, letterSpacing: 8 * k, marginTop: -10 * k }]}>SQUISHER</Text>
            <Text style={styles.subtitle}>DRIVE. SQUISH. UPGRADE.</Text>
            <View style={styles.stats}>
              <Stat label="KILL BANK" value={progress.totalKills} />
              <Stat label="BEST RUN" value={progress.bestRunKills} />
            </View>
          </View>

          <View style={[styles.col, landscape && { width: rightW }]}>
            <Plate style={[styles.loadout, { width: '100%' }]}>
              <Text style={styles.loadoutTitle}>LOADOUT</Text>
              <Line k="Vehicle" v={v.name} />
              <Line k="Weapon" v={w.name} />
              <Line k="Sides" v={s.name} />
              <Line k="Ability" v={a.name} />
            </Plate>
            <Button label="DRIVE" onPress={onPlay} variant="primary" big style={styles.drive} />
            <View style={styles.row}>
              <Button label="GARAGE" onPress={onGarage} style={{ minWidth: 0, paddingHorizontal: 14 }} />
              <ToggleChip label="SFX" on={settings.sfx} onPress={() => onSettings({ ...settings, sfx: !settings.sfx })} />
              <ToggleChip label="MUSIC" on={settings.music} onPress={() => onSettings({ ...settings, music: !settings.music })} />
            </View>
          </View>
        </View>
      </ScrollView>
      <HazardStripe height={10} />

      <AboutModal visible={aboutOpen} onClose={() => setAboutOpen(false)} />
    </View>
  );
}

function Line({ k, v }: { k: string; v: string }) {
  return <Text style={styles.line}>{k}: <Text style={styles.lineVal}>{v}</Text></Text>;
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <Plate style={styles.stat}>
      <Text style={styles.statValue}>{value.toLocaleString()}</Text>
      <Text style={styles.statLabel}>{label}</Text>
    </Plate>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  rowLayout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 32 },
  colLayout: { alignItems: 'center', gap: 20 },
  col: { alignItems: 'center' },
  gear: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: colors.panelSolid, borderWidth: 2, borderColor: colors.edge, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  gearIcon: { color: colors.hazard, fontSize: 22, lineHeight: 26 },
  title: { ...type.title, color: colors.danger, fontSize: 56, letterSpacing: 6, textShadowColor: '#000', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 6 },
  titleAlt: { ...type.title, color: colors.hazard, fontSize: 46, letterSpacing: 8, marginTop: -10, textShadowColor: '#000', textShadowOffset: { width: 0, height: 4 }, textShadowRadius: 6 },
  subtitle: { ...type.label, color: colors.dim, fontSize: 12, marginTop: 6, marginBottom: 14, letterSpacing: 3 },
  stats: { flexDirection: 'row', gap: 12 },
  stat: { minWidth: 100, alignItems: 'center', paddingVertical: 8 },
  statValue: { ...type.number, color: colors.text, fontSize: 26 },
  statLabel: { ...type.label, color: colors.dim, fontSize: 10 },
  loadout: { width: 270, marginBottom: 12 },
  loadoutTitle: { ...type.label, color: colors.dim, fontSize: 11, marginBottom: 4 },
  line: { color: colors.dim, marginVertical: 1, fontSize: 14 },
  lineVal: { color: colors.text, fontWeight: '800' },
  drive: { alignSelf: 'stretch', minWidth: 0, marginBottom: 10 },
  row: { flexDirection: 'row', gap: 6, alignItems: 'center', alignSelf: 'stretch', justifyContent: 'space-between' },
});
