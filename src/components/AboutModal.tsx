import React from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Updates from 'expo-updates';

interface Props {
  visible: boolean;
  onClose: () => void;
}

/**
 * Build/OTA version info modal. Text is selectable so the user can
 * long-press to copy it. Avoids adding @react-native-clipboard/clipboard
 * as a dep just for this.
 */
export function AboutModal({ visible, onClose }: Props) {
  const created = Updates.createdAt instanceof Date ? Updates.createdAt.toISOString() : 'n/a';
  const lines = [
    `Runtime version : ${Updates.runtimeVersion ?? 'n/a'}`,
    `Channel         : ${Updates.channel ?? 'n/a'}`,
    `Update ID       : ${Updates.updateId ?? '(embedded — APK bundle)'}`,
    `Created at      : ${created}`,
    `Embedded launch : ${String(Updates.isEmbeddedLaunch)}`,
  ].join('\n');

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.card} onPress={() => {}}>
          <Text style={styles.title}>ABOUT</Text>
          <Text selectable style={styles.body}>{lines}</Text>
          <Text style={styles.hint}>Long-press the text above to select & copy.</Text>
          <Pressable onPress={onClose} style={styles.closeBtn}>
            <Text style={styles.closeText}>CLOSE</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.7)', justifyContent: 'center', alignItems: 'center', padding: 20 },
  card: { backgroundColor: '#1a1a1a', borderRadius: 14, borderWidth: 2, borderColor: '#ffd24a', padding: 20, width: '100%', maxWidth: 420 },
  title: { color: '#ffd24a', fontSize: 18, fontWeight: '900', letterSpacing: 4, marginBottom: 14, textAlign: 'center' },
  body: { color: '#fff', fontFamily: 'Courier', fontSize: 13, lineHeight: 20 },
  hint: { color: '#888', fontSize: 11, marginTop: 12, fontStyle: 'italic', textAlign: 'center' },
  closeBtn: { marginTop: 16, backgroundColor: '#2a2a2a', paddingVertical: 10, borderRadius: 10, alignItems: 'center' },
  closeText: { color: '#ffd24a', fontWeight: '800', letterSpacing: 2 },
});
