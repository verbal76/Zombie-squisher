import React, { useEffect, useRef, useState } from 'react';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ability, Vehicle } from '../types';
import { World, KILL_SPEED, StreakBannerKind } from '../game/engine';
import { Insets } from '../game/controls';
import { Settings } from '../store/settingsLogic';
import { ToggleChip } from './ToggleChip';
import { HazardStripe } from '../ui/HazardStripe';
import { colors, fonts, type } from '../ui/theme';

function SpeedBar({ world, vehicle }: { world: World; vehicle: Vehicle }) {
  const fillPct = Math.max(0, Math.min(1, world.momentum)) * 100;
  const tickPct = Math.max(0, Math.min(1, KILL_SPEED / Math.max(1, vehicle.baseSpeed))) * 100;
  const inKillRange = world.momentum * vehicle.baseSpeed >= KILL_SPEED;
  const fillColor = inKillRange ? '#3acb55' : '#e34a4a';
  const mphNow = Math.round(world.momentum * vehicle.topSpeedMph);
  return (
    <>
      <View style={styles.gaugeLabelRow}>
        <Text style={styles.gaugeLabel}>SPEED</Text>
        <Text style={styles.gaugeReadout}>{mphNow} / {vehicle.topSpeedMph} MPH</Text>
      </View>
      <View style={styles.momentumWrap}>
        <View style={[styles.momentumFill, { width: `${fillPct}%`, backgroundColor: fillColor }]} />
        <View style={[styles.momentumTick, { left: `${tickPct}%` }]} />
      </View>
    </>
  );
}

const STREAK_LABELS: Record<Exclude<StreakBannerKind, null>, string> = {
  spree: 'KILLING SPREE',
  reaper: 'ROAD REAPER',
  breaker: 'HORDE BREAKER',
  apocalypse: 'APOCALYPSE ENGINE',
};

function StreakBanner({ world }: { world: World }) {
  const opacity = useRef(new Animated.Value(0)).current;
  const [visibleKind, setVisibleKind] = useState<StreakBannerKind>(null);
  const lastAt = useRef(0);

  useEffect(() => {
    if (world.streakBannerKind && world.streakBannerAt !== lastAt.current) {
      lastAt.current = world.streakBannerAt;
      setVisibleKind(world.streakBannerKind);
      opacity.stopAnimation();
      opacity.setValue(0);
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 150, useNativeDriver: true }),
        Animated.delay(900),
        Animated.timing(opacity, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start(() => {
        setVisibleKind(null);
        world.streakBannerKind = null;
      });
    }
  });

  if (!visibleKind) return null;
  return (
    <Animated.View pointerEvents="none" style={[styles.streakBanner, { opacity }]}>
      <Text style={styles.streakBannerText}>{STREAK_LABELS[visibleKind]}</Text>
    </Animated.View>
  );
}


interface HudProps {
  world: World;
  vehicle: Vehicle;
  ability: Ability;
  /** false when no ability is equipped. */
  abilityEquipped: boolean;
  insets: Insets;
  /** Developer-only lines; omit in production. */
  debug?: string[];
  onPause: () => void;
  onAbout: () => void;
  onAbility: () => void;
}

export function GameHud({ world: w, vehicle, ability, abilityEquipped, insets, debug, onPause, onAbout, onAbility }: HudProps) {
  const hudTop = insets.top + 8;
  const hpPct = Math.max(0, w.hp / Math.max(1, w.maxHp));
  const cdPct = ability.cooldownMs > 0 ? 1 - w.abilityCooldown / ability.cooldownMs : 1;
  const hpColor = hpPct > 0.5 ? colors.ok : hpPct > 0.25 ? colors.hazard : colors.danger;
  return (
    <>
      <View style={[styles.panel, { top: hudTop, left: insets.left + 12 }]} pointerEvents="none">
        <View style={styles.hudRow}>
          <Text style={styles.hudKills}>KILLS <Text style={styles.hudKillsNum}>{w.kills}</Text></Text>
          <Text style={styles.hudWave}>WAVE {w.wave + 1}</Text>
        </View>
        <View style={styles.gaugeLabelRow}>
          <Text style={styles.gaugeLabel}>VEHICLE HP</Text>
          <Text style={styles.gaugeReadout}>{Math.round(w.hp)} / {Math.round(w.maxHp)}</Text>
        </View>
        <View style={styles.hpBar}>
          <View style={[styles.hpFill, { width: `${hpPct * 100}%`, backgroundColor: hpColor }]} />
        </View>
        <SpeedBar world={w} vehicle={vehicle} />
        {w.streak > 0 && <Text style={styles.streakText}>STREAK ×{w.streak}</Text>}
        {debug?.map((line, i) => <Text key={i} style={styles.dbg}>{line}</Text>)}
        <HazardStripe height={5} style={styles.stripe} />
      </View>

      <StreakBanner world={w} />

      <Pressable accessibilityLabel="Pause" style={[styles.iconBtn, { top: hudTop - 2, right: insets.right + 60 }]} onPress={onPause} hitSlop={8}>
        <Text style={styles.iconText}>❚❚</Text>
      </Pressable>
      <Pressable accessibilityLabel="About" style={[styles.iconBtn, { top: hudTop - 2, right: insets.right + 12 }]} onPress={onAbout} hitSlop={8}>
        <Text style={styles.iconText}>⚙</Text>
      </Pressable>

      {abilityEquipped && (
        <Pressable
          onPress={onAbility}
          style={[styles.abilityBtn, { top: hudTop + 52, right: insets.right + 12 }, w.abilityCooldown > 0 && styles.abilityBtnDisabled]}
        >
          <Text style={styles.abilityText}>{ability.name}</Text>
          <View style={styles.abilityCdBar}>
            <View style={[styles.abilityCdFill, { width: `${cdPct * 100}%` }]} />
          </View>
        </Pressable>
      )}
    </>
  );
}

interface PauseProps {
  settings: Settings;
  onSettings: (s: Settings) => void;
  onResume: () => void;
  onEndRun: () => void;
}

export function PauseOverlay({ settings, onSettings, onResume, onEndRun }: PauseProps) {
  return (
    <View style={styles.pauseOverlay}>
      <View style={styles.pauseCard}>
        <HazardStripe height={10} />
        <View style={styles.pauseBody}>
          <Text style={styles.pauseTitle}>PAUSED</Text>
          <Pressable style={styles.pauseBtn} onPress={onResume}>
            <Text style={styles.pauseBtnText}>RESUME</Text>
          </Pressable>
          <View style={styles.pauseToggles}>
            <ToggleChip label="SOUND FX" on={settings.sfx} onPress={() => onSettings({ ...settings, sfx: !settings.sfx })} />
            <ToggleChip label="MUSIC" on={settings.music} onPress={() => onSettings({ ...settings, music: !settings.music })} />
          </View>
          <Pressable style={[styles.pauseBtn, styles.pauseBtnAlt]} onPress={onEndRun}>
            <Text style={[styles.pauseBtnText, { color: colors.text }]}>END RUN</Text>
          </Pressable>
        </View>
        <HazardStripe height={10} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: { position: 'absolute', width: 300, backgroundColor: colors.panel, borderRadius: 8, borderWidth: 1, borderColor: colors.edge, borderLeftWidth: 4, borderLeftColor: colors.hazard, paddingHorizontal: 10, paddingTop: 4, paddingBottom: 0, overflow: 'hidden' },
  stripe: { marginTop: 5, marginHorizontal: -10 },
  hudRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'baseline' },
  hudKills: { ...type.label, color: colors.dim, fontSize: 13 },
  hudKillsNum: { ...type.number, color: colors.text, fontSize: 24 },
  hudWave: { ...type.title, color: colors.hazard, fontSize: 15 },
  hpBar: { marginTop: 2, height: 10, backgroundColor: '#2a0e0e', borderRadius: 5, overflow: 'hidden' },
  hpFill: { height: '100%' },
  dbg: { color: '#9ff', fontFamily: fonts.mono, fontSize: 11, marginTop: 4 },
  iconBtn: { position: 'absolute', width: 44, height: 44, borderRadius: 22, backgroundColor: colors.panel, borderWidth: 2, borderColor: colors.edge, alignItems: 'center', justifyContent: 'center', zIndex: 10 },
  iconText: { color: colors.hazard, fontSize: 18, lineHeight: 22, fontWeight: '900' },
  abilityBtn: { position: 'absolute', backgroundColor: colors.panelSolid, paddingHorizontal: 16, paddingVertical: 10, borderRadius: 12, borderWidth: 2, borderColor: colors.hazard, minWidth: 110, alignItems: 'center' },
  abilityBtnDisabled: { opacity: 0.5, borderColor: colors.faint },
  abilityText: { ...type.label, color: colors.hazard, fontSize: 13 },
  abilityCdBar: { marginTop: 6, height: 4, width: 90, backgroundColor: '#333', borderRadius: 2, overflow: 'hidden' },
  abilityCdFill: { height: '100%', backgroundColor: colors.hazard },
  momentumWrap: { marginTop: 2, height: 6, backgroundColor: '#1a1a1a', borderRadius: 3, overflow: 'hidden', position: 'relative' },
  momentumFill: { height: '100%' },
  momentumTick: { position: 'absolute', top: 0, bottom: 0, width: 2, backgroundColor: colors.hazard },
  gaugeLabelRow: { flexDirection: 'row', justifyContent: 'space-between', marginTop: 3 },
  gaugeLabel: { ...type.label, color: colors.dim, fontSize: 10 },
  gaugeReadout: { ...type.label, color: colors.text, fontSize: 10 },
  streakText: { ...type.title, color: colors.hazard, fontSize: 14, marginTop: 4, letterSpacing: 1 },
  streakBanner: { position: 'absolute', top: '32%', left: 0, right: 0, alignItems: 'center', zIndex: 20 },
  streakBannerText: { ...type.title, color: colors.hazard, fontSize: 32, textShadowColor: '#000', textShadowOffset: { width: 0, height: 2 }, textShadowRadius: 4 },
  pauseOverlay: { ...StyleSheet.absoluteFillObject, backgroundColor: 'rgba(0,0,0,0.72)', alignItems: 'center', justifyContent: 'center', zIndex: 30 },
  pauseCard: { width: 320, maxWidth: '90%', backgroundColor: colors.panelSolid, borderRadius: 12, borderWidth: 2, borderColor: colors.edge, overflow: 'hidden' },
  pauseBody: { padding: 18, alignItems: 'center', gap: 10 },
  pauseTitle: { ...type.title, color: colors.hazard, fontSize: 34, marginBottom: 4 },
  pauseToggles: { flexDirection: 'row', gap: 10 },
  pauseBtn: { minWidth: 210, minHeight: 48, borderRadius: 10, backgroundColor: colors.hazard, alignItems: 'center', justifyContent: 'center' },
  pauseBtnAlt: { backgroundColor: colors.danger },
  pauseBtnText: { ...type.title, color: '#15110d', fontSize: 16 },
});
