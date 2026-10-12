import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { GLYPH_IDS, BTN, GamepadMapper, KeyboardMapper, MENU_REPEAT_FIRST_MS, MENU_REPEAT_MS, KEY_PROMPTS, PROMPTS, PadSnapshot, keyToMenuEvent, mergeIntents, NO_INTENT, pickNextFocus } from '../src/platform/inputMapping';
import { createControlBus } from '../src/game/controlBus';
import { computeControlLayout } from '../src/game/controls';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

const pad = (btn: Record<number, number> = {}, axes: number[] = [0, 0, 0, 0]): PadSnapshot => ({ buttons: Array.from({ length: 17 }, (_, i) => btn[i] ?? 0), axes });
/** Run a mapper through a few neutral frames so it is armed. */
function armed(m: GamepadMapper, playing: boolean, t = 0) { m.poll(pad(), playing, t); m.poll(pad(), playing, t + 16); return t + 32; }

test('gamepad (playing): sticks, d-pad and triggers map to the existing controls', () => {
  const m = new GamepadMapper(); let t = armed(m, true);
  assert.equal(m.poll(pad({}, [0.9, 0, 0, 0]), true, t += 16).intent.steerRight, true);
  assert.equal(m.poll(pad({}, [-0.9, 0, 0, 0]), true, t += 16).intent.steerLeft, true);
  assert.equal(m.poll(pad({ [BTN.LEFT]: 1 }), true, t += 16).intent.steerLeft, true, 'd-pad steers too');
  assert.equal(m.poll(pad({ [BTN.RT]: 1 }), true, t += 16).intent.turbo, true, 'RT = turbo');
  assert.equal(m.poll(pad({ [BTN.RB]: 1 }), true, t += 16).intent.turbo, true, 'RB = turbo');
  assert.equal(m.poll(pad({ [BTN.LT]: 1 }), true, t += 16).intent.reverse, true, 'LT = reverse');
  const none = m.poll(pad(), true, t += 16).intent;
  assert.deepEqual({ ...none }, { ...NO_INTENT });
});

test('gamepad: dead zone with hysteresis (no unwanted movement from stick drift)', () => {
  const m = new GamepadMapper(); let t = armed(m, true);
  for (const drift of [0.05, 0.15, 0.3, -0.3]) assert.equal(m.poll(pad({}, [drift, 0, 0, 0]), true, t += 16).intent.steerRight || m.poll(pad({}, [drift, 0, 0, 0]), true, t += 16).intent.steerLeft, false, `drift ${drift}`);
  assert.equal(m.poll(pad({}, [0.5, 0, 0, 0]), true, t += 16).intent.steerRight, true, 'engages above 0.35');
  assert.equal(m.poll(pad({}, [0.25, 0, 0, 0]), true, t += 16).intent.steerRight, true, 'stays engaged between the thresholds');
  assert.equal(m.poll(pad({}, [0.15, 0, 0, 0]), true, t += 16).intent.steerRight, false, 'releases below 0.2');
});

test('gamepad: opposing inputs cancel, and the right stick is unused', () => {
  const m = new GamepadMapper(); let t = armed(m, true);
  const both = m.poll(pad({ [BTN.LEFT]: 1, [BTN.RIGHT]: 1 }), true, t += 16).intent;
  assert.equal(both.steerLeft || both.steerRight, false);
  assert.deepEqual({ ...m.poll(pad({}, [0, 0, 1, 1]), true, t += 16).intent }, { ...NO_INTENT });
});

test('gamepad: ability, guns toggle and pause fire once per press', () => {
  const m = new GamepadMapper(); let t = armed(m, true);
  const a = [m.poll(pad({ [BTN.A]: 1 }), true, t += 16), m.poll(pad({ [BTN.A]: 1 }), true, t += 16), m.poll(pad({ [BTN.A]: 1 }), true, t += 16)].map((r) => r.intent.ability);
  assert.deepEqual(a, [true, false, false]);
  m.poll(pad(), true, t += 16);
  assert.equal(m.poll(pad({ [BTN.X]: 1 }), true, t += 16).intent.gunsToggle, true);
  assert.equal(m.poll(pad({ [BTN.X]: 1 }), true, t += 16).intent.gunsToggle, false);
  m.poll(pad(), true, t += 16);
  assert.equal(m.poll(pad({ [BTN.START]: 1 }), true, t += 16).intent.pause, true);
});

test('gamepad: the press that confirmed a menu item never leaks into gameplay (no accidental ability / firing)', () => {
  const m = new GamepadMapper(); let t = armed(m, false);
  assert.deepEqual(m.poll(pad({ [BTN.A]: 1 }), false, t += 16).menu, ['confirm']);
  // the run starts while A is still physically held
  for (let i = 0; i < 5; i++) { const r = m.poll(pad({ [BTN.A]: 1 }), true, t += 16); assert.equal(r.intent.ability, false, 'held A must not trigger the ability'); }
  m.poll(pad(), true, t += 16); m.poll(pad(), true, t += 16);
  assert.equal(m.poll(pad({ [BTN.A]: 1 }), true, t += 16).intent.ability, true, 'a fresh press does');
});

test('gamepad: held controls are not carried across pause (no stuck steering / turbo) and must be re-pressed', () => {
  const m = new GamepadMapper(); let t = armed(m, true);
  assert.equal(m.poll(pad({ [BTN.RT]: 1 }, [0.9, 0, 0, 0]), true, t += 16).intent.turbo, true);
  const paused = m.poll(pad({ [BTN.RT]: 1 }, [0.9, 0, 0, 0]), false, t += 16);
  assert.deepEqual({ ...paused.intent }, { ...NO_INTENT });
  assert.deepEqual(paused.menu, [], 'still-held inputs raise no menu events either');
  const back = m.poll(pad({ [BTN.RT]: 1 }, [0.9, 0, 0, 0]), true, t += 16).intent;
  assert.equal(back.turbo || back.steerRight, false, 'still held after resume: ignored until released');
  m.poll(pad(), true, t += 16); m.poll(pad(), true, t += 16);
  assert.equal(m.poll(pad({ [BTN.RT]: 1 }), true, t += 16).intent.turbo, true, 'works again after release + press');
});

test('gamepad (menu): d-pad / stick navigate with auto-repeat, A confirms, B cancels, Start resumes', () => {
  const m = new GamepadMapper(); let t = armed(m, false, 1000);
  assert.deepEqual(m.poll(pad({ [BTN.DOWN]: 1 }), false, t += 16).menu, ['down']);
  assert.deepEqual(m.poll(pad({ [BTN.DOWN]: 1 }), false, t += 100).menu, [], 'no repeat yet');
  assert.deepEqual(m.poll(pad({ [BTN.DOWN]: 1 }), false, t += MENU_REPEAT_FIRST_MS).menu, ['down'], 'first repeat after the delay');
  assert.deepEqual(m.poll(pad({ [BTN.DOWN]: 1 }), false, t += MENU_REPEAT_MS - 10).menu, []);
  assert.deepEqual(m.poll(pad({ [BTN.DOWN]: 1 }), false, t += 20).menu, ['down'], 'then at the repeat rate');
  m.poll(pad(), false, t += 16);
  assert.deepEqual(m.poll(pad({}, [0, -0.9, 0, 0]), false, t += 16).menu, ['up'], 'left stick navigates');
  m.poll(pad(), false, t += 16);
  assert.deepEqual(m.poll(pad({ [BTN.B]: 1 }), false, t += 16).menu, ['cancel']);
  m.poll(pad(), false, t += 16);
  assert.deepEqual(m.poll(pad({ [BTN.START]: 1 }), false, t += 16).menu, ['start']);
});

test('gamepad: a disconnected pad resets the mapper (hot-plug)', () => {
  const m = new GamepadMapper(); let t = armed(m, true);
  m.poll(pad({ [BTN.RT]: 1 }), true, t += 16);
  assert.deepEqual({ ...m.poll(null, true, t += 16).intent }, { ...NO_INTENT });
  t = armed(m, true, t + 16);
  assert.equal(m.poll(pad({ [BTN.RT]: 1 }), true, t += 16).intent.turbo, true, 'a reconnected pad works after neutral frames');
});

test('keyboard: arrows/WASD steer, W/Shift turbo, S reverse, Space ability, G guns, Esc pause; focus loss releases everything', () => {
  const k = new KeyboardMapper();
  for (const c of ['ArrowLeft', 'KeyW', 'KeyS']) assert.equal(k.keyDown(c), true);
  let i = k.intent();
  assert.deepEqual([i.steerLeft, i.turbo, i.reverse], [true, true, true]);
  k.keyDown('Space'); k.keyDown('KeyG'); k.keyDown('Escape');
  i = k.intent(); assert.deepEqual([i.ability, i.gunsToggle, i.pause], [true, true, true]);
  i = k.intent(); assert.deepEqual([i.ability, i.gunsToggle, i.pause], [false, false, false], 'one-shot');
  k.keyDown('Space', true); assert.equal(k.intent().ability, false, 'auto-repeat does not re-fire');
  k.keyDown('ArrowRight'); i = k.intent(); assert.equal(i.steerLeft || i.steerRight, false, 'left+right cancel');
  k.releaseAll(); i = k.intent(); assert.deepEqual({ ...i }, { ...NO_INTENT });
  assert.equal(k.keyDown('KeyZ'), false, 'unmapped keys are left to the browser');
});

test('keyboard and gamepad combine; menu keys map to menu events', () => {
  const a = { ...NO_INTENT, steerLeft: true }, b = { ...NO_INTENT, turbo: true, ability: true };
  assert.deepEqual(mergeIntents(a, b), { ...NO_INTENT, steerLeft: true, turbo: true, ability: true });
  assert.equal(mergeIntents({ ...NO_INTENT, steerLeft: true }, { ...NO_INTENT, steerRight: true }).steerLeft, false);
  assert.deepEqual(['ArrowUp', 'ArrowDown', 'Enter', 'Escape', 'KeyZ'].map(keyToMenuEvent), ['up', 'down', 'confirm', 'cancel', null]);
});

test('spatial focus: moves to the nearest control in the pressed direction and never loses focus', () => {
  const r = (x: number, y: number, w = 100, h = 40) => ({ x, y, w, h });
  const rects = [r(500, 300, 340, 60), r(500, 380, 114, 48), r(630, 380, 114, 48), r(500, 460, 80, 48)];   // DRIVE / GARAGE / SFX / MUSIC
  assert.equal(pickNextFocus(rects, 0, 'down'), 2, 'the control directly underneath wins over a nearer-but-offset one');
  assert.equal(pickNextFocus(rects, 1, 'right'), 2);
  assert.equal(pickNextFocus(rects, 2, 'left'), 1);
  assert.equal(pickNextFocus(rects, 1, 'down'), 3);
  assert.equal(pickNextFocus(rects, 3, 'up'), 1);
  assert.equal(pickNextFocus(rects, 0, 'up'), 0, 'nothing above: stay put');
  assert.equal(pickNextFocus(rects, -1, 'down'), 0, 'no focus yet: first control');
  assert.equal(pickNextFocus([], 0, 'down'), -1);
});

test('controller prompts exist for play and menu in both glyph sets', () => {
  for (const set of [PROMPTS, KEY_PROMPTS]) { assert.ok(set.play.length >= 5); assert.ok(set.menu.length >= 3); }
  assert.ok(PROMPTS.play.some(([k, v]) => k === 'A' && /ability/i.test(v)));
  assert.ok(PROMPTS.menu.some(([k, v]) => k === 'B' && /back/i.test(v)));
});

test('control bus: delivers to subscribers and unsubscribes cleanly', () => {
  const bus = createControlBus(); const seen: string[] = [];
  const off = bus.subscribe({ onHold: (k, on) => seen.push(`hold:${k}:${on}`), onTap: (k) => seen.push(`tap:${k}`) });
  bus.hold('turbo', true); bus.tap('gunsToggle'); off(); bus.hold('turbo', false);
  assert.deepEqual(seen, ['hold:turbo:true', 'tap:gunsToggle']);
});

test('Steam Deck 1280x800 (16:10): on-screen controls fit and stay clear of the HUD', () => {
  for (const [w, h] of [[1280, 800], [1280, 720], [1920, 1080], [1024, 640]]) {
    const l = computeControlLayout(w, h, { top: 0, right: 0, bottom: 0, left: 0 });
    for (const b of l.buttons) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= w && b.y + b.h <= h, `${w}x${h} ${b.kind} inside the display`);
    assert.ok(Math.min(...l.buttons.map((b) => Math.min(b.w, b.h))) >= 44, 'touch targets >= 44 px');
  }
});

// ---- Android must be untouched by the desktop work -----------------------------------------------------------------

test('desktop-only code is web-gated: the metro aliases apply to platform "web" only', () => {
  const m = read('metro.config.js');
  assert.match(m, /if \(platform === 'web'\) \{[\s\S]*@react-three\/fiber\/native[\s\S]*expo-file-system\/legacy[\s\S]*\}/);
  const native = read('src/platform/desktop.ts');
  assert.doesNotMatch(native, /document|window|navigator|requestAnimationFrame/, 'native stub must not touch DOM APIs');
  assert.match(native, /no-op on native/);
});

test('shared game code has no desktop forks: the only shared edits are one hook call, one install call and an optional bus prop', () => {
  assert.match(read('src/components/GameScreen.tsx'), /useDesktopGameInput\(/);
  assert.match(read('App.tsx'), /installDesktopShell\(\)/);
  for (const f of ['src/game/engine.ts', 'src/components/GameScene.tsx', 'src/components/ZombieHorde.tsx', 'src/game/controls.ts']) {
    assert.doesNotMatch(read(f), /platform\/desktop|Platform\.OS === 'web'|hagDesktop/, `${f} must stay platform-neutral`);
  }
});

test('prompt glyphs: every prompt label is mapped, every glyph file exists, license/provenance is recorded', () => {
  const labels = new Set([...PROMPTS.play, ...PROMPTS.menu, ...KEY_PROMPTS.play, ...KEY_PROMPTS.menu].map(([k]) => k as string));
  for (const l of labels) assert.ok(l in GLYPH_IDS, `prompt label "${l}" needs an entry in GLYPH_IDS`);
  const web = read('src/platform/glyphs.web.ts');
  for (const [label, ids] of Object.entries(GLYPH_IDS)) for (const id of ids) {
    assert.ok(fs.existsSync(path.join(root, 'assets/glyphs', `${id}.png`)), `glyph file for ${id} (${label})`);
    assert.ok(web.includes(`'${id}'`), `glyphs.web.ts registers ${id}`);
  }
  const readme = read('assets/glyphs/README.md');
  assert.match(readme, /CC0/); assert.match(readme, /JulioCacko/); assert.match(readme, /NOT independently/);
});
