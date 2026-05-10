import React from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { BUILD_INFO } from '../__generated__/build-info';
import { BUILD_VERSION, OTA_VERSION } from '../version';

interface Props {
  visible: boolean;
  onClose: () => void;
}

interface OtaInfo {
  updateId: string | null;
  runtimeVersion: string | null;
  channel: string | null;
  createdAt: string | null;
  isEmbeddedLaunch: boolean | null;
}

const NA = 'n/a';

function safe<T>(fn: () => T, fallback: T): T {
  try { return fn(); } catch { return fallback; }
}

function readOta(): OtaInfo {
  const created = safe<Date | null>(() => (Updates.createdAt as Date | null) ?? null, null);
  return {
    updateId:         safe(() => Updates.updateId ?? null, null),
    runtimeVersion:   safe(() => Updates.runtimeVersion ?? null, null),
    channel:          safe(() => Updates.channel ?? null, null),
    createdAt:        created instanceof Date ? created.toISOString() : null,
    isEmbeddedLaunch: safe(() => Updates.isEmbeddedLaunch ?? null, null),
  };
}

function otaIsStale(ota: OtaInfo): boolean {
  if (!ota.createdAt) return false;
  const otaT = Date.parse(ota.createdAt);
  const buildT = Date.parse(BUILD_INFO.builtAt);
  return Number.isFinite(otaT) && Number.isFinite(buildT) && otaT < buildT;
}

function fmtBool(v: boolean | null, yes = 'yes', no = 'no'): string {
  return v === null ? NA : v ? yes : no;
}

export function AboutModal({ visible, onClose }: Props) {
  const ota = readOta();
  const stale = otaIsStale(ota);

  const rows: Array<[string, string, boolean?]> = [
    ['Build',               BUILD_VERSION],
    ['OTA',                 OTA_VERSION],
    ['Branch',              BUILD_INFO.branch + (BUILD_INFO.dirty ? ' ⚠ dirty' : '')],
    ['Commit',              BUILD_INFO.commitShort, true],
    ['Full SHA',            BUILD_INFO.commit, true],
    ['Built',               BUILD_INFO.builtAt, true],
    ['App version',         BUILD_INFO.appVersion],
    ['Android versionCode', String(BUILD_INFO.androidVersionCode ?? NA)],
    ['Runtime',             ota.runtimeVersion ?? NA],
    ['Channel',             ota.channel ?? NA],
    ['OTA updateId',        ota.updateId ?? NA, true],
    ['OTA createdAt',       ota.createdAt ?? NA, true],
    ['Source',              fmtBool(ota.isEmbeddedLaunch, 'embedded (APK)', 'OTA download')],
  ];

  const copyText = rows.map(([k, v]) => `${k.padEnd(22, ' ')}${v}`).join('\n')
    + (stale ? '\nWARNING               OTA older than embedded bundle (stale update)' : '');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>ABOUT</Text>
          <Text style={styles.subtitle}>Build identification</Text>

          <ScrollView style={styles.list} contentContainerStyle={{ paddingBottom: 4 }}>
            {rows.map(([label, value, mono]) => (
              <View style={styles.row} key={label}>
                <Text style={styles.label}>{label}</Text>
                <Text style={[styles.value, mono && styles.mono]} selectable>{value}</Text>
              </View>
            ))}
          </ScrollView>

          {stale && (
            <Text style={styles.warn}>
              {'⚠ OTA is older than the embedded bundle — launcher fell back to embedded.'}
            </Text>
          )}

          <View style={styles.copyBlock}>
            <Text style={styles.copyHint}>Long-press the block below, "Select all", then "Copy":</Text>
            <Text style={styles.copyBox} selectable>{copyText}</Text>
          </View>

          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>CLOSE</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.78)', justifyContent: 'center', alignItems: 'center', padding: 16 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 14, borderWidth: 2, borderColor: '#ffd24a', padding: 16, width: '100%', maxWidth: 460, maxHeight: '90%' },
  title: { color: '#ffd24a', fontSize: 18, fontWeight: '900', letterSpacing: 4, textAlign: 'center' },
  subtitle: { color: '#888', fontSize: 11, fontStyle: 'italic', textAlign: 'center', marginTop: 2, marginBottom: 12 },
  list: { maxHeight: 280 },
  row: { flexDirection: 'row', paddingVertical: 3, borderBottomWidth: 1, borderBottomColor: '#222' },
  label: { color: '#888', width: 130, fontSize: 12 },
  value: { color: '#fff', flex: 1, fontSize: 12 },
  mono: { fontFamily: 'Courier', fontSize: 11 },
  warn: { color: '#ffb04a', fontSize: 12, marginTop: 10, fontWeight: '700', textAlign: 'center' },
  copyBlock: { marginTop: 12 },
  copyHint: { color: '#888', fontSize: 10, fontStyle: 'italic', marginBottom: 4 },
  copyBox: { backgroundColor: '#0a0a0a', borderColor: '#2a2a2a', borderWidth: 1, borderRadius: 6, padding: 8, color: '#cfd', fontFamily: 'Courier', fontSize: 10 },
  closeBtn: { marginTop: 14, backgroundColor: '#2a2a2a', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  closeText: { color: '#ffd24a', fontWeight: '800', letterSpacing: 2 },
});
