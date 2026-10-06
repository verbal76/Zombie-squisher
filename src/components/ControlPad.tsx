import React, { MutableRefObject, useEffect, useMemo, useState } from 'react';
import { GestureResponderEvent, StyleSheet, Text, View } from 'react-native';
import { ControlLayout, HOLD_KINDS, TouchKind, TouchPoint, TouchTracker, classifyTouch } from '../game/controls';
import { GearState } from '../game/engine';
import { colors, type } from '../ui/theme';

/** Live input state read by the game loop every frame (mutated here, never re-created). */
export interface ControlInput {
  steerLeft: boolean;
  steerRight: boolean;
  turbo: boolean;
  gear: GearState;
  autoFire: boolean;
}

const toPoints = (ts: ReadonlyArray<{ identifier: number; pageX: number; pageY: number }> | undefined): TouchPoint[] =>
  (ts ?? []).map((t) => ({ identifier: t.identifier, pageX: t.pageX, pageY: t.pageY }));

const LABELS: Record<TouchKind, string> = { steerLeft: '◀', steerRight: '▶', gearForward: 'F', gearReverse: 'R', turbo: '⚡', gunsToggle: '🔫' };

interface Props {
  layout: ControlLayout;
  input: MutableRefObject<ControlInput>;
  /** Bump to release every held button (pause, About, interruptions). */
  releaseSignal: number;
}

export function ControlPad({ layout, input, releaseSignal }: Props) {
  const [held, setHeld] = useState<ReadonlySet<TouchKind>>(new Set());
  const [gear, setGear] = useState<GearState>(input.current.gear);
  const [guns, setGuns] = useState(input.current.autoFire);

  const tracker = useMemo(() => new TouchTracker(layout, {
    onHold: (kind, on) => {
      if (kind === 'steerLeft' || kind === 'steerRight' || kind === 'turbo') input.current[kind] = on;
      setHeld((prev) => { const n = new Set(prev); if (on) n.add(kind); else n.delete(kind); return n; });
    },
    onTap: (kind) => {
      if (kind === 'gearForward') { input.current.gear = 'forward'; setGear('forward'); }
      else if (kind === 'gearReverse') { input.current.gear = 'reverse'; setGear('reverse'); }
      else if (kind === 'gunsToggle') { const next = !input.current.autoFire; input.current.autoFire = next; setGuns(next); }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), []);

  useEffect(() => { tracker.setLayout(layout); }, [tracker, layout]);
  useEffect(() => { if (releaseSignal > 0) tracker.releaseAll(); }, [tracker, releaseSignal]);

  const onTouches = (e: GestureResponderEvent) => tracker.update(toPoints(e.nativeEvent.touches as any), toPoints(e.nativeEvent.changedTouches as any));
  const onEnd = () => tracker.releaseAll();
  const wants = (e: GestureResponderEvent) => classifyTouch(layout, e.nativeEvent.pageX, e.nativeEvent.pageY) !== null;

  return (
    <View
      style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: layout.overlayHeight }}
      onStartShouldSetResponder={wants}
      onMoveShouldSetResponder={wants}
      onResponderGrant={onTouches}
      onResponderMove={onTouches}
      onResponderRelease={onEnd}
      onResponderTerminate={onEnd}
    >
      {layout.buttons.map((b) => {
        const active = HOLD_KINDS.has(b.kind) ? held.has(b.kind)
          : b.kind === 'gearForward' ? gear === 'forward'
          : b.kind === 'gearReverse' ? gear === 'reverse'
          : guns;
        const isArrow = b.kind === 'steerLeft' || b.kind === 'steerRight';
        return (
          <View
            key={b.kind}
            pointerEvents="none"
            accessibilityLabel={`${b.kind}${active ? ' active' : ''}`}
            style={[
              styles.btn,
              { left: b.x, top: b.y - layout.overlayTop, width: b.w, height: b.h, borderRadius: b.w / 2 },
              active ? stylesActive[b.kind] : b.kind === 'gunsToggle' ? styles.gunsOff : null,
            ]}
          >
            <Text style={isArrow ? styles.arrow : styles.mid}>{LABELS[b.kind]}</Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  btn: { position: 'absolute', backgroundColor: 'rgba(20,16,12,0.55)', borderColor: 'rgba(255,255,255,0.28)', borderWidth: 2, alignItems: 'center', justifyContent: 'center' },
  gunsOff: { opacity: 0.55, borderColor: 'rgba(255,255,255,0.18)' },
  arrow: { ...type.number, color: colors.text, fontSize: 36 },
  mid: { ...type.number, color: colors.text, fontSize: 22, letterSpacing: 1 },
});

const press = (bg: string, border: string) => ({ backgroundColor: bg, borderColor: border });
const stylesActive: Record<TouchKind, object> = {
  steerLeft: press('rgba(34,211,238,0.30)', 'rgba(34,211,238,0.95)'),
  steerRight: press('rgba(34,211,238,0.30)', 'rgba(34,211,238,0.95)'),
  gearForward: press('rgba(34,211,238,0.25)', colors.cyan),
  gearReverse: press('rgba(249,115,22,0.28)', '#f97316'),
  turbo: press('rgba(255,196,0,0.32)', colors.hazard),
  gunsToggle: press('rgba(58,203,85,0.25)', colors.ok),
};
