// A tiny pub/sub that lets a non-touch input source (keyboard, gamepad on the desktop build) drive the SAME handlers the
// on-screen pad uses, so button highlights, gear and guns state stay in sync. Pure TypeScript, unit tested.
import type { TouchKind } from './controls';

export interface ControlBus {
  hold(kind: TouchKind, on: boolean): void;
  tap(kind: TouchKind): void;
  subscribe(l: { onHold(kind: TouchKind, on: boolean): void; onTap(kind: TouchKind): void }): () => void;
}

export function createControlBus(): ControlBus {
  const listeners = new Set<{ onHold(kind: TouchKind, on: boolean): void; onTap(kind: TouchKind): void }>();
  return {
    hold: (kind, on) => listeners.forEach((l) => l.onHold(kind, on)),
    tap: (kind) => listeners.forEach((l) => l.onTap(kind)),
    subscribe: (l) => { listeners.add(l); return () => { listeners.delete(l); }; },
  };
}
