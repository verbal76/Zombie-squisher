// What the on-screen pad's handlers do to the live input state, as pure functions (unit tested). ControlPad (touch)
// and the desktop ControlBus (keyboard / gamepad) both call these, so every source behaves exactly like a finger.
import type { GearState } from './engine';
import type { TouchKind } from './controls';

/** Live input state read by the game loop every frame (mutated, never re-created). */
export interface PadInput {
  steerLeft: boolean;
  steerRight: boolean;
  turbo: boolean;
  gear: GearState;
  autoFire: boolean;
}

export function applyHold(input: PadInput, kind: TouchKind, on: boolean): void {
  if (kind === 'steerLeft' || kind === 'steerRight' || kind === 'turbo') input[kind] = on;
}

/** Applies a tap button and returns the UI state that changed (so the caller can mirror it into React state). */
export function applyTap(input: PadInput, kind: TouchKind): { gear?: GearState; guns?: boolean } {
  if (kind === 'gearForward') { input.gear = 'forward'; return { gear: 'forward' }; }
  if (kind === 'gearReverse') { input.gear = 'reverse'; return { gear: 'reverse' }; }
  if (kind === 'gunsToggle') { const next = !input.autoFire; input.autoFire = next; return { guns: next }; }
  return {};
}
