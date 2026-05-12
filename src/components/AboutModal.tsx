import React, { useEffect, useState } from 'react';
import { ActivityIndicator, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';
import { BUILD_INFO } from '../__generated__/build-info';
import { BUILD_VERSION, OTA_VERSION } from '../version';
import { Diag, DiagSnapshot } from '../debug/diagnostics';

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
  const [checking, setChecking] = useState(false);
  const [checkResult, setCheckResult] = useState<string | null>(null);
  const [diag, setDiag] = useState<DiagSnapshot>(() => Diag.snapshot());
  useEffect(() => {
    if (!visible) return;
    setDiag(Diag.snapshot());
    return Diag.subscribe(() => setDiag(Diag.snapshot()));
  }, [visible]);

  const onCheckUpdate = async () => {
    setChecking(true);
    setCheckResult('Checking...');
    try {
      const update = await Updates.checkForUpdateAsync();
      if (!update.isAvailable) {
        setCheckResult('No newer OTA available for this build.');
      } else {
        setCheckResult('OTA available — downloading and applying...');
        await Updates.fetchUpdateAsync();
        await Updates.reloadAsync();
      }
    } catch (err: any) {
      setCheckResult(`Error: ${err?.message ?? String(err)}`);
    } finally {
      setChecking(false);
    }
  };

  const modelLine = diag.modelsAttempted > 0
    ? `${diag.modelsLoaded}/${diag.modelsAttempted}`
    : '0/0';
  const drawBufLine = diag.drawBufW > 0
    ? `${diag.drawBufW}x${diag.drawBufH}`
    : NA;

  const lines: Array<[string, string]> = [
    ['Build',               BUILD_VERSION],
    ['OTA',                 OTA_VERSION],
    ['Branch',              BUILD_INFO.branch + (BUILD_INFO.dirty ? ' (dirty)' : '')],
    ['Commit',              BUILD_INFO.commitShort],
    ['Full SHA',            BUILD_INFO.commit],
    ['Built',               BUILD_INFO.builtAt],
    ['App version',         BUILD_INFO.appVersion],
    ['Android versionCode', String(BUILD_INFO.androidVersionCode ?? NA)],
    ['Runtime',             ota.runtimeVersion ?? NA],
    ['Channel',             ota.channel ?? NA],
    ['OTA updateId',        ota.updateId ?? NA],
    ['OTA createdAt',       ota.createdAt ?? NA],
    ['Source',              fmtBool(ota.isEmbeddedLaunch, 'embedded (APK)', 'OTA download')],
    ['---',                 '---'],
    ['3D MODELS',           modelLine],
    ['FRAMES',              String(diag.frames)],
    ['DRAW BUF',            drawBufLine],
    ['SCENE',               String(diag.sceneObjects)],
    ['RENDER ERR',          diag.lastRenderError ?? '(none)'],
  ];
  const text = lines.map(([k, v]) => `${k.padEnd(22, ' ')}${v}`).join('\n')
    + (stale ? '\nWARNING               OTA older than embedded bundle (stale update)' : '');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>ABOUT</Text>
          <Text style={styles.subtitle}>Build identification</Text>

          <ScrollView style={styles.scrollWrap} contentContainerStyle={{ paddingBottom: 4 }}>
            <Text selectable style={styles.body}>{text}</Text>
          </ScrollView>

          {stale && (
            <Text style={styles.warn}>
              {'⚠ OTA is older than the embedded bundle — launcher fell back to embedded.'}
            </Text>
          )}

          <Pressable onPress={onCheckUpdate} disabled={checking} style={[styles.checkBtn, checking && styles.checkBtnDisabled]}>
            {checking ? (
              <ActivityIndicator color="#0a0a0a" />
            ) : (
              <Text style={styles.checkText}>CHECK FOR OTA UPDATE</Text>
            )}
          </Pressable>
          {checkResult && (
            <Text selectable style={styles.checkResult}>{checkResult}</Text>
          )}

          <Text style={styles.hint}>Long-press the text to select, then "Copy".</Text>

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
  scrollWrap: { maxHeight: 380 },
  body: { color: '#cfd', fontFamily: 'Courier', fontSize: 12, lineHeight: 18, backgroundColor: '#0a0a0a', borderColor: '#2a2a2a', borderWidth: 1, borderRadius: 6, padding: 10 },
  warn: { color: '#ffb04a', fontSize: 12, marginTop: 10, fontWeight: '700', textAlign: 'center' },
  checkBtn: { marginTop: 10, backgroundColor: '#ffd24a', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  checkBtnDisabled: { opacity: 0.6 },
  checkText: { color: '#0a0a0a', fontWeight: '900', letterSpacing: 2 },
  checkResult: { color: '#9ff', fontFamily: 'Courier', fontSize: 11, marginTop: 6, padding: 8, backgroundColor: '#0a0a0a', borderRadius: 6 },
  hint: { color: '#888', fontSize: 10, fontStyle: 'italic', marginTop: 8, textAlign: 'center' },
  closeBtn: { marginTop: 14, backgroundColor: '#2a2a2a', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  closeText: { color: '#ffd24a', fontWeight: '800', letterSpacing: 2 },
});
