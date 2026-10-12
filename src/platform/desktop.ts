// Native (Android / iOS) side of the desktop-shell bridge: intentionally inert. The real implementation is
// desktop.web.ts, which Metro picks only for the web platform (the Electron build for Windows / Linux / Steam Deck).
import type { ControlBus } from '../game/controlBus';

export interface DesktopGameInput {
  bus: ControlBus;
  /** true while the car is actually being driven (not paused, no About, not game over). */
  active: boolean;
  onAbility(): void;
  onPause(): void;
  onResume(): void;
  /** true when the pause overlay is up (Start resumes). */
  paused: boolean;
}

export function installDesktopShell(): void { /* no-op on native */ }
export function useDesktopGameInput(_input: DesktopGameInput): void { /* no-op on native */ }
