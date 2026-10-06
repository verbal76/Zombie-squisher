import React from 'react';
import { ScrollView, StyleSheet, Text, View, useWindowDimensions } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Progress } from '../types';
import { WEAPONS, ABILITIES } from '../data/weapons';
import { SIDE_MODS } from '../data/sideMods';
import { Button } from '../ui/Button';
import { Plate } from '../ui/Plate';
import { HazardStripe } from '../ui/HazardStripe';
import { colors, type } from '../ui/theme';

interface Props {
  kills: number;
  beforeProgress: Progress;
  afterProgress: Progress;
  onRetry: () => void;
  onMenu: () => void;
}

export function GameOverScreen({ kills, beforeProgress, afterProgress, onRetry, onMenu }: Props) {
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const landscape = width > height;
  const newWeapons = afterProgress.unlockedWeapons.filter((w) => !beforeProgress.unlockedWeapons.includes(w));
  const newAbilities = afterProgress.unlockedAbilities.filter((a) => !beforeProgress.unlockedAbilities.includes(a));
  const newSideMods = afterProgress.unlockedSideMods.filter((s) => !beforeProgress.unlockedSideMods.includes(s));
  const anyUnlock = newWeapons.length + newAbilities.length + newSideMods.length > 0;
  const isBest = kills > beforeProgress.bestRunKills;

  return (
    <View style={styles.root}>
      <HazardStripe height={10} />
      <ScrollView
        contentContainerStyle={[styles.scroll, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 12, paddingLeft: insets.left + 24, paddingRight: insets.right + 24 }]}
        showsVerticalScrollIndicator={false}
      >
        <View style={landscape ? styles.rowLayout : styles.colLayout}>
          <View style={styles.col}>
            <Text style={styles.title}>WIPED OUT</Text>
            <Text style={styles.kills}>{kills.toLocaleString()}</Text>
            <Text style={styles.killsLabel}>ZOMBIES SQUISHED</Text>
            {isBest && <Text style={styles.best}>★ NEW PERSONAL BEST ★</Text>}
            <Text style={styles.bank}>Kill bank: {afterProgress.totalKills.toLocaleString()}</Text>
          </View>

          <View style={styles.col}>
            {anyUnlock && (
              <Plate style={styles.unlocks}>
                <Text style={styles.unlocksTitle}>UNLOCKED</Text>
                {newWeapons.map((w) => <Text key={w} style={styles.unlockLine}>+ {WEAPONS[w].name}</Text>)}
                {newSideMods.map((s) => <Text key={s} style={styles.unlockLine}>+ {SIDE_MODS[s].name}</Text>)}
                {newAbilities.map((a) => <Text key={a} style={styles.unlockLine}>+ {ABILITIES[a].name}</Text>)}
              </Plate>
            )}
            <Text style={styles.hint}>Spend your kills in the Garage to upgrade between runs.</Text>
            <View style={styles.btns}>
              <Button label="DRIVE AGAIN" onPress={onRetry} variant="primary" />
              <Button label="GARAGE" onPress={onMenu} />
            </View>
          </View>
        </View>
      </ScrollView>
      <HazardStripe height={10} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  scroll: { flexGrow: 1, alignItems: 'center', justifyContent: 'center' },
  rowLayout: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 56 },
  colLayout: { alignItems: 'center', gap: 20 },
  col: { alignItems: 'center', maxWidth: 360 },
  title: { ...type.title, color: colors.danger, fontSize: 38, letterSpacing: 5, textShadowColor: '#000', textShadowOffset: { width: 0, height: 3 }, textShadowRadius: 5 },
  kills: { ...type.number, color: colors.hazard, fontSize: 76, lineHeight: 84 },
  killsLabel: { ...type.label, color: colors.dim, fontSize: 13, letterSpacing: 3, marginTop: -4 },
  best: { ...type.label, color: colors.cyan, fontSize: 13, marginTop: 10 },
  bank: { color: colors.dim, fontSize: 13, marginTop: 8 },
  unlocks: { minWidth: 240, marginBottom: 12 },
  unlocksTitle: { ...type.label, color: colors.dim, fontSize: 11, marginBottom: 4 },
  unlockLine: { color: colors.hazard, fontWeight: '800', marginVertical: 2, fontSize: 15 },
  hint: { color: colors.dim, textAlign: 'center', marginBottom: 14, fontSize: 13 },
  btns: { flexDirection: 'row', gap: 12, flexWrap: 'wrap', justifyContent: 'center' },
});
