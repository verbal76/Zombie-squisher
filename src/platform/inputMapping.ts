// Desktop / Steam Deck input mapping. PURE (no DOM, no React) so every rule is unit tested.
// It maps keyboard + standard-layout gamepad state onto the game's EXISTING controls (steer left/right, turbo hold,
// gear forward/reverse, guns toggle, ability, pause) and onto menu navigation. It introduces no new mechanics.

/** Standard Gamepad API button indices (XInput pads and Steam Deck via Steam Input). */
export const BTN = { A: 0, B: 1, X: 2, Y: 3, LB: 4, RB: 5, LT: 6, RT: 7, BACK: 8, START: 9, L3: 10, R3: 11, UP: 12, DOWN: 13, LEFT: 14, RIGHT: 15, GUIDE: 16 } as const;

export const STICK_ON = 0.35;     // engage threshold (dead zone) ...
export const STICK_OFF = 0.2;     // ... release threshold: hysteresis stops chatter around the edge
export const TRIGGER_ON = 0.35;
export const TRIGGER_OFF = 0.2;
export const MENU_REPEAT_FIRST_MS = 380;
export const MENU_REPEAT_MS = 130;

export interface PadSnapshot { buttons: ReadonlyArray<number>; axes: ReadonlyArray<number>; }

export type MenuEvent = 'up' | 'down' | 'left' | 'right' | 'confirm' | 'cancel' | 'start';

/** What the player is asking the car to do right now (level state) plus one-shot actions (edges). */
export interface GameIntent {
  steerLeft: boolean; steerRight: boolean; turbo: boolean; reverse: boolean;
  ability: boolean; gunsToggle: boolean; pause: boolean;
}
export const NO_INTENT: GameIntent = { steerLeft: false, steerRight: false, turbo: false, reverse: false, ability: false, gunsToggle: false, pause: false };

const val = (s: PadSnapshot, i: number) => s.buttons[i] ?? 0;

function hyst(prev: boolean, v: number, on: number, off: number): boolean {
  return prev ? v > off : v > on;
}

/**
 * Stateful gamepad interpreter. `poll()` is called once per animation frame.
 *  - `playing` true  -> returns a GameIntent (and no menu events)
 *  - `playing` false -> returns MenuEvents (and a neutral intent)
 * Switching between the two disarms the pad until EVERY button/stick/trigger has been released, so the A press that
 * confirmed "DRIVE" can never fire the ability and a held trigger can never carry through a pause (no stuck input).
 */
export class GamepadMapper {
  private level = { left: false, right: false, turbo: false, reverse: false };
  private prevEdge = { ability: false, guns: false, pause: false, up: false, down: false, left: false, right: false, confirm: false, cancel: false, start: false };
  private armed = false;
  private lastPlaying: boolean | null = null;
  private repeat: { dir: MenuEvent | null; next: number } = { dir: null, next: 0 };

  reset(): void {
    this.level = { left: false, right: false, turbo: false, reverse: false };
    for (const k of Object.keys(this.prevEdge) as Array<keyof typeof this.prevEdge>) this.prevEdge[k] = false;
    this.armed = false; this.lastPlaying = null; this.repeat = { dir: null, next: 0 };
  }

  poll(snap: PadSnapshot | null, playing: boolean, now: number): { intent: GameIntent; menu: MenuEvent[] } {
    if (!snap) { this.reset(); return { intent: { ...NO_INTENT }, menu: [] }; }
    const lx = snap.axes[0] ?? 0, ly = snap.axes[1] ?? 0;
    const anyDown = snap.buttons.some((v) => v > TRIGGER_OFF) || Math.abs(lx) > STICK_OFF || Math.abs(ly) > STICK_OFF;

    if (this.lastPlaying !== playing) {       // mode change: disarm until released
      this.lastPlaying = playing; this.armed = false;
      this.level = { left: false, right: false, turbo: false, reverse: false };
      this.repeat = { dir: null, next: 0 };
      for (const k of Object.keys(this.prevEdge) as Array<keyof typeof this.prevEdge>) this.prevEdge[k] = true;   // treat held buttons as already-pressed
    }
    if (!this.armed) {
      if (anyDown) return { intent: { ...NO_INTENT }, menu: [] };
      this.armed = true;
      for (const k of Object.keys(this.prevEdge) as Array<keyof typeof this.prevEdge>) this.prevEdge[k] = false;
    }

    const edge = (key: keyof typeof this.prevEdge, now_: boolean) => { const r = now_ && !this.prevEdge[key]; this.prevEdge[key] = now_; return r; };

    if (playing) {
      this.level.left = hyst(this.level.left, Math.max(-lx, val(snap, BTN.LEFT)), STICK_ON, STICK_OFF);
      this.level.right = hyst(this.level.right, Math.max(lx, val(snap, BTN.RIGHT)), STICK_ON, STICK_OFF);
      if (this.level.left && this.level.right) { this.level.left = this.level.right = false; }   // opposing inputs cancel
      this.level.turbo = hyst(this.level.turbo, Math.max(val(snap, BTN.RT), val(snap, BTN.RB), val(snap, BTN.LB)), TRIGGER_ON, TRIGGER_OFF);
      this.level.reverse = hyst(this.level.reverse, val(snap, BTN.LT), TRIGGER_ON, TRIGGER_OFF);
      const intent: GameIntent = {
        steerLeft: this.level.left, steerRight: this.level.right, turbo: this.level.turbo, reverse: this.level.reverse,
        ability: edge('ability', val(snap, BTN.A) > 0.5),
        gunsToggle: edge('guns', val(snap, BTN.X) > 0.5),
        pause: edge('pause', val(snap, BTN.START) > 0.5),
      };
      return { intent, menu: [] };
    }

    // menu mode
    const menu: MenuEvent[] = [];
    const dirNow: MenuEvent | null =
      val(snap, BTN.UP) > 0.5 || ly < -STICK_ON ? 'up' :
      val(snap, BTN.DOWN) > 0.5 || ly > STICK_ON ? 'down' :
      val(snap, BTN.LEFT) > 0.5 || lx < -STICK_ON ? 'left' :
      val(snap, BTN.RIGHT) > 0.5 || lx > STICK_ON ? 'right' : null;
    if (dirNow === null) this.repeat = { dir: null, next: 0 };
    else if (this.repeat.dir !== dirNow) { this.repeat = { dir: dirNow, next: now + MENU_REPEAT_FIRST_MS }; menu.push(dirNow); }
    else if (now >= this.repeat.next) { this.repeat.next = now + MENU_REPEAT_MS; menu.push(dirNow); }
    if (edge('confirm', val(snap, BTN.A) > 0.5)) menu.push('confirm');
    if (edge('cancel', val(snap, BTN.B) > 0.5)) menu.push('cancel');
    if (edge('start', val(snap, BTN.START) > 0.5)) menu.push('start');
    return { intent: { ...NO_INTENT }, menu };
  }
}

// ---- keyboard ---------------------------------------------------------------------------------------------------

const KEY_STEER_L = ['ArrowLeft', 'KeyA'];
const KEY_STEER_R = ['ArrowRight', 'KeyD'];
const KEY_TURBO = ['ArrowUp', 'KeyW', 'ShiftLeft', 'ShiftRight'];
const KEY_REVERSE = ['ArrowDown', 'KeyS'];

export class KeyboardMapper {
  private down = new Set<string>();
  private pending = { ability: false, gunsToggle: false, pause: false };

  /** Returns true when the key is one the game consumes (caller should preventDefault). */
  keyDown(code: string, repeat = false): boolean {
    const known = [...KEY_STEER_L, ...KEY_STEER_R, ...KEY_TURBO, ...KEY_REVERSE, 'Space', 'KeyG', 'Escape', 'KeyP'].includes(code);
    if (!known) return false;
    if (!repeat && !this.down.has(code)) {
      if (code === 'Space') this.pending.ability = true;
      if (code === 'KeyG') this.pending.gunsToggle = true;
      if (code === 'Escape' || code === 'KeyP') this.pending.pause = true;
    }
    this.down.add(code);
    return true;
  }
  keyUp(code: string): void { this.down.delete(code); }
  /** Window lost focus: nothing may stay held. */
  releaseAll(): void { this.down.clear(); this.pending = { ability: false, gunsToggle: false, pause: false }; }

  private any = (codes: string[]) => codes.some((c) => this.down.has(c));
  /** Level state now + one-shot actions since the last call. */
  intent(): GameIntent {
    const left = this.any(KEY_STEER_L), right = this.any(KEY_STEER_R);
    const out: GameIntent = {
      steerLeft: left && !right, steerRight: right && !left, turbo: this.any(KEY_TURBO), reverse: this.any(KEY_REVERSE),
      ability: this.pending.ability, gunsToggle: this.pending.gunsToggle, pause: this.pending.pause,
    };
    this.pending = { ability: false, gunsToggle: false, pause: false };
    return out;
  }
}

/** Menu-mode meaning of a keyboard key (null = not ours). */
export function keyToMenuEvent(code: string): MenuEvent | null {
  switch (code) {
    case 'ArrowUp': case 'KeyW': return 'up';
    case 'ArrowDown': case 'KeyS': return 'down';
    case 'ArrowLeft': case 'KeyA': return 'left';
    case 'ArrowRight': case 'KeyD': return 'right';
    case 'Enter': case 'NumpadEnter': case 'Space': return 'confirm';
    case 'Escape': case 'Backspace': return 'cancel';
    case 'KeyP': return 'start';
    default: return null;
  }
}

// ---- combining + spatial menu navigation ---------------------------------------------------------------------------

/** Keyboard and gamepad act together: any source holding a control holds it; edges from either count. */
export function mergeIntents(a: GameIntent, b: GameIntent): GameIntent {
  const left = a.steerLeft || b.steerLeft, right = a.steerRight || b.steerRight;
  return {
    steerLeft: left && !right, steerRight: right && !left,
    turbo: a.turbo || b.turbo, reverse: a.reverse || b.reverse,
    ability: a.ability || b.ability, gunsToggle: a.gunsToggle || b.gunsToggle, pause: a.pause || b.pause,
  };
}

export interface Rect { x: number; y: number; w: number; h: number; }

/**
 * Directional focus movement over on-screen rectangles. Picks the nearest rect whose centre lies in the requested
 * half-plane, weighting off-axis distance double so "down" prefers the button underneath. Returns the current index
 * when nothing lies that way (focus never gets lost), or 0 when there is no current focus.
 */
export function pickNextFocus(rects: ReadonlyArray<Rect>, current: number, dir: 'up' | 'down' | 'left' | 'right'): number {
  if (rects.length === 0) return -1;
  if (current < 0 || current >= rects.length) return 0;
  const c = rects[current];
  const cx = c.x + c.w / 2, cy = c.y + c.h / 2;
  let best = current, bestScore = Infinity;
  rects.forEach((r, i) => {
    if (i === current) return;
    const dx = r.x + r.w / 2 - cx, dy = r.y + r.h / 2 - cy;
    const along = dir === 'up' ? -dy : dir === 'down' ? dy : dir === 'left' ? -dx : dx;
    const across = dir === 'up' || dir === 'down' ? Math.abs(dx) : Math.abs(dy);
    if (along <= 1) return;                       // not in that direction
    const score = along + across * 2;
    if (score < bestScore) { bestScore = score; best = i; }
  });
  return best;
}

/** Which controller glyph set to show. Steam Deck / Xbox use A B X Y; kept as data so tests pin the prompts. */
export const PROMPTS = {
  play: [['LS', 'Steer'], ['RT', 'Turbo'], ['LT', 'Reverse'], ['A', 'Ability'], ['X', 'Guns'], ['☰', 'Pause']] as const,
  menu: [['D-pad', 'Move'], ['A', 'Select'], ['B', 'Back'], ['☰', 'Resume']] as const,
};
export const KEY_PROMPTS = {
  play: [['A D / ← →', 'Steer'], ['W / Shift', 'Turbo'], ['S', 'Reverse'], ['Space', 'Ability'], ['G', 'Guns'], ['Esc', 'Pause']] as const,
  menu: [['Arrows', 'Move'], ['Enter', 'Select'], ['Esc', 'Back']] as const,
};

/** Glyph ids (see assets/glyphs) for each prompt label; an empty list means "no glyph in the pack: show a text badge". */
export const GLYPH_IDS: Record<string, string[]> = {
  // gamepad (Xbox / Steam Deck ABXY)
  LS: ['xbox/L'], RT: ['xbox/RT'], LT: ['xbox/LT'], A: ['xbox/A'], B: ['xbox/B'], X: ['xbox/X'], 'D-pad': ['xbox/Dpad'], '☰': [],
  // keyboard
  'A D / ← →': ['key/A', 'key/D'], 'W / Shift': ['key/W', 'key/Shift'], S: ['key/S'], Space: ['key/Space'], G: ['key/G'], Esc: ['key/Esc'],
  Arrows: ['key/Up', 'key/Down', 'key/Left', 'key/Right'], Enter: ['key/Enter'],
};
