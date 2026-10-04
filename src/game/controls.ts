// Touch-control layout, hit-testing and multi-touch tracking. Pure TypeScript (no React Native), unit tested.
// The on-screen pad is the primary input (INPUT_DESIGN.md): large buttons, comfortable thumb placement.

export type TouchKind = 'steerLeft' | 'steerRight' | 'gearForward' | 'gearReverse' | 'turbo' | 'gunsToggle';
export const HOLD_KINDS: ReadonlySet<TouchKind> = new Set<TouchKind>(['steerLeft', 'steerRight', 'turbo']);

export interface Insets { top: number; right: number; bottom: number; left: number; }
export interface ButtonLayout { kind: TouchKind; x: number; y: number; w: number; h: number; }
export interface ControlLayout { buttons: ButtonLayout[]; overlayTop: number; overlayHeight: number; }

export const ARROW_BTN_SIZE = 88;
export const MID_BTN_SIZE = 68;
export const INTRA_CLUSTER_GAP = 14;
export const INTRA_VERTICAL_GAP = 12;   // gap between TURBO / GUNS and the arrow each sits above
export const EDGE_MARGIN = 16;
export const BUTTON_ROW_BOTTOM = 22;
export const BUTTON_HITSLOP = 22;
const BASE_OVERLAY_H = ARROW_BTN_SIZE + MID_BTN_SIZE + INTRA_VERTICAL_GAP + BUTTON_ROW_BOTTOM * 2;

//   left column:    [ GUNS ]                       right column:   [ TURBO ]
//                  [ < LEFT ] [ F ]                               [ R ] [ RIGHT > ]
export function computeControlLayout(sw: number, sh: number, insets: Insets): ControlLayout {
  const rowCenterY = sh - insets.bottom - BUTTON_ROW_BOTTOM - ARROW_BTN_SIZE / 2;
  const arrowY = rowCenterY - ARROW_BTN_SIZE / 2;
  const midY = rowCenterY - MID_BTN_SIZE / 2;
  const leftArrowX = insets.left + EDGE_MARGIN;
  const rightArrowX = sw - insets.right - EDGE_MARGIN - ARROW_BTN_SIZE;
  const stackY = arrowY - INTRA_VERTICAL_GAP - MID_BTN_SIZE;
  const overlayHeight = BASE_OVERLAY_H + insets.bottom;
  return {
    overlayHeight,
    overlayTop: sh - overlayHeight,
    buttons: [
      { kind: 'steerLeft',   x: leftArrowX,                                   y: arrowY, w: ARROW_BTN_SIZE, h: ARROW_BTN_SIZE },
      { kind: 'gearForward', x: leftArrowX + ARROW_BTN_SIZE + INTRA_CLUSTER_GAP, y: midY,   w: MID_BTN_SIZE,   h: MID_BTN_SIZE },
      { kind: 'gunsToggle',  x: leftArrowX + (ARROW_BTN_SIZE - MID_BTN_SIZE) / 2, y: stackY, w: MID_BTN_SIZE,   h: MID_BTN_SIZE },
      { kind: 'turbo',       x: rightArrowX + (ARROW_BTN_SIZE - MID_BTN_SIZE) / 2, y: stackY, w: MID_BTN_SIZE,   h: MID_BTN_SIZE },
      { kind: 'gearReverse', x: rightArrowX - INTRA_CLUSTER_GAP - MID_BTN_SIZE, y: midY,   w: MID_BTN_SIZE,   h: MID_BTN_SIZE },
      { kind: 'steerRight',  x: rightArrowX,                                  y: arrowY, w: ARROW_BTN_SIZE, h: ARROW_BTN_SIZE },
    ],
  };
}

/**
 * Which button does a touch at (x, y) belong to? Hit areas are the button grown by BUTTON_HITSLOP. Where
 * grown areas overlap (e.g. LEFT and F), the button whose centre is nearest wins instead of array order.
 */
export function classifyTouch(layout: ControlLayout, x: number, y: number): TouchKind | null {
  let best: TouchKind | null = null;
  let bestD = Infinity;
  for (const b of layout.buttons) {
    if (x < b.x - BUTTON_HITSLOP || x > b.x + b.w + BUTTON_HITSLOP || y < b.y - BUTTON_HITSLOP || y > b.y + b.h + BUTTON_HITSLOP) continue;
    // distance to the button's edge (0 when the finger is on the button itself), so a small button's
    // grown area cannot steal touches that are clearly on the big button next to it
    const dx = Math.max(b.x - x, 0, x - (b.x + b.w)), dy = Math.max(b.y - y, 0, y - (b.y + b.h));
    const d = dx * dx + dy * dy;
    if (d < bestD) { bestD = d; best = b.kind; }
  }
  return best;
}

export interface TouchPoint { identifier: number; pageX: number; pageY: number; }
export interface TouchHandlers {
  /** Hold buttons: on = first finger down on this kind, off = last finger lifted. */
  onHold: (kind: TouchKind, on: boolean) => void;
  /** Tap buttons fire once per finger-down. */
  onTap: (kind: TouchKind) => void;
}

/**
 * Tracks fingers across responder events. A finger is bound to the button it first lands on (sliding
 * off keeps the hold, as the game always did). Hold state is reference counted per button so two
 * fingers on one button do not cancel each other.
 */
export class TouchTracker {
  private fingers = new Map<number, TouchKind>();
  private holds = new Map<TouchKind, number>();

  constructor(private layout: ControlLayout, private h: TouchHandlers) {}

  setLayout(layout: ControlLayout): void { this.layout = layout; }

  /** `active` = every finger currently down, `changed` = fingers that changed in this event. */
  update(active: TouchPoint[], changed: TouchPoint[]): void {
    const activeIds = new Set(active.map((t) => t.identifier));
    for (const t of active) {
      if (this.fingers.has(t.identifier)) continue;
      const kind = classifyTouch(this.layout, t.pageX, t.pageY);
      if (!kind) continue;
      this.fingers.set(t.identifier, kind);
      if (HOLD_KINDS.has(kind)) this.hold(kind, +1); else this.h.onTap(kind);
    }
    for (const t of changed) {
      if (activeIds.has(t.identifier)) continue;
      this.lift(t.identifier);
    }
    // a finger we track that is no longer reported at all (lost event) must not stay stuck
    for (const id of Array.from(this.fingers.keys())) if (!activeIds.has(id) && active.length === 0) this.lift(id);
  }

  releaseAll(): void {
    for (const id of Array.from(this.fingers.keys())) this.lift(id);
  }

  get heldKinds(): TouchKind[] {
    return Array.from(this.holds.entries()).filter(([, n]) => n > 0).map(([k]) => k);
  }

  private lift(id: number): void {
    const kind = this.fingers.get(id);
    if (!kind) return;
    this.fingers.delete(id);
    if (HOLD_KINDS.has(kind)) this.hold(kind, -1);
  }

  private hold(kind: TouchKind, delta: 1 | -1): void {
    const n = (this.holds.get(kind) ?? 0) + delta;
    this.holds.set(kind, Math.max(0, n));
    if (delta === 1 && n === 1) this.h.onHold(kind, true);
    if (delta === -1 && n <= 0) this.h.onHold(kind, false);
  }
}
