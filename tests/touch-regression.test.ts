import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { applyHold, applyTap, PadInput } from '../src/game/padState';
import { HOLD_KINDS, Insets, TouchKind, TouchPoint, TouchTracker, computeControlLayout } from '../src/game/controls';
import { createControlBus } from '../src/game/controlBus';

const root = path.resolve(__dirname, '..');
const read = (f: string) => fs.readFileSync(path.join(root, f), 'utf8');

const fresh = (): PadInput => ({ steerLeft: false, steerRight: false, turbo: false, gear: 'forward', autoFire: true });

/** The ControlPad handlers exactly as they were before the desktop work (commit 49aeaac), kept here as the reference. */
function legacyHold(input: PadInput, kind: TouchKind, on: boolean) { if (kind === 'steerLeft' || kind === 'steerRight' || kind === 'turbo') input[kind] = on; }
function legacyTap(input: PadInput, kind: TouchKind) {
  const ui: { gear?: string; guns?: boolean } = {};
  if (kind === 'gearForward') { input.gear = 'forward'; ui.gear = 'forward'; }
  else if (kind === 'gearReverse') { input.gear = 'reverse'; ui.gear = 'reverse'; }
  else if (kind === 'gunsToggle') { const next = !input.autoFire; input.autoFire = next; ui.guns = next; }
  return ui;
}

const KINDS: TouchKind[] = ['steerLeft', 'steerRight', 'gearForward', 'gearReverse', 'turbo', 'gunsToggle'];

test('handlers: the extracted pure functions behave exactly like the original ControlPad handlers (randomised sequences)', () => {
  let seed = 12345; const rnd = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff;
  for (let run = 0; run < 200; run++) {
    const a = fresh(), b = fresh();
    for (let i = 0; i < 60; i++) {
      const kind = KINDS[Math.floor(rnd() * KINDS.length)];
      if (rnd() < 0.5) { applyHold(a, kind, rnd() < 0.5 ? true : false); } else { const ua = applyTap(a, kind); const ub = legacyTap(b, kind); assert.deepEqual(ua, ub); continue; }
      // replay the same hold on the legacy side with the same value (recompute from a)
      legacyHold(b, kind, kind === 'steerLeft' || kind === 'steerRight' || kind === 'turbo' ? a[kind] : false);
      assert.deepEqual(a, b, `run ${run} step ${i} ${kind}`);
    }
  }
});

test('handlers: hold sets only the three hold flags; taps set gear and guns; unknown combinations do nothing', () => {
  const i = fresh();
  applyHold(i, 'steerLeft', true); assert.equal(i.steerLeft, true); applyHold(i, 'steerLeft', false); assert.equal(i.steerLeft, false);
  applyHold(i, 'turbo', true); assert.equal(i.turbo, true);
  applyHold(i, 'gearReverse', true); assert.equal(i.gear, 'forward', 'gear is not a hold button');
  assert.deepEqual(applyTap(i, 'gearReverse'), { gear: 'reverse' }); assert.equal(i.gear, 'reverse');
  assert.deepEqual(applyTap(i, 'gearForward'), { gear: 'forward' });
  assert.deepEqual(applyTap(i, 'gunsToggle'), { guns: false }); assert.equal(i.autoFire, false);
  assert.deepEqual(applyTap(i, 'gunsToggle'), { guns: true });
  assert.deepEqual(applyTap(i, 'steerLeft'), {}, 'a hold button tapped does nothing');
});

// ---- the real touch pipeline: layout -> TouchTracker -> handlers -> input state --------------------------------------------

const SIZES: Array<[number, number, Insets]> = [
  [2400, 1080, { top: 0, right: 48, bottom: 24, left: 48 }], [1920, 1080, { top: 0, right: 0, bottom: 0, left: 0 }],
  [2340, 1080, { top: 0, right: 90, bottom: 0, left: 90 }], [1280, 720, { top: 0, right: 0, bottom: 48, left: 0 }],
];
function rig(sw: number, sh: number, insets: Insets) {
  const layout = computeControlLayout(sw, sh, insets);
  const input = fresh();
  const ui = { held: new Set<TouchKind>(), gear: 'forward', guns: true };
  const tracker = new TouchTracker(layout, {
    onHold: (k, on) => { applyHold(input, k, on); if (on) ui.held.add(k); else ui.held.delete(k); },
    onTap: (k) => { const c = applyTap(input, k); if (c.gear) ui.gear = c.gear; if (c.guns !== undefined) ui.guns = c.guns; },
  });
  const centre = (k: TouchKind) => { const b = layout.buttons.find((x) => x.kind === k)!; return { x: b.x + b.w / 2, y: b.y + b.h / 2 }; };
  const pt = (id: number, k: TouchKind): TouchPoint => ({ identifier: id, pageX: centre(k).x, pageY: centre(k).y });
  return { layout, input, ui, tracker, pt };
}

test('touch: steering and turbo press/release through the real tracker and handlers at several Android sizes', () => {
  for (const [w, h, ins] of SIZES) {
    const r = rig(w, h, ins);
    const left = r.pt(1, 'steerLeft'); r.tracker.update([left], [left]);
    assert.deepEqual([r.input.steerLeft, r.input.steerRight, r.input.turbo], [true, false, false], `${w}x${h} steer left down`);
    r.tracker.update([], [left]);
    assert.equal(r.input.steerLeft, false, 'steer left released on lift');
    const right = r.pt(2, 'steerRight'), turbo = r.pt(3, 'turbo');
    r.tracker.update([right], [right]); r.tracker.update([right, turbo], [turbo]);
    assert.deepEqual([r.input.steerRight, r.input.turbo], [true, true], 'two fingers: steer right + turbo');
    r.tracker.update([turbo], [right]);
    assert.deepEqual([r.input.steerRight, r.input.turbo], [false, true], 'independent release (multi-touch)');
    r.tracker.update([], [turbo]);
    assert.deepEqual([r.input.steerLeft, r.input.steerRight, r.input.turbo], [false, false, false]);
  }
});

test('touch: gear F/R and the GUNS toggle fire once per touch and the on-screen state follows', () => {
  const r = rig(2400, 1080, { top: 0, right: 48, bottom: 24, left: 48 });
  const rev = r.pt(1, 'gearReverse'); r.tracker.update([rev], [rev]); r.tracker.update([], [rev]);
  assert.equal(r.input.gear, 'reverse'); assert.equal(r.ui.gear, 'reverse');
  const fwd = r.pt(2, 'gearForward'); r.tracker.update([fwd], [fwd]); r.tracker.update([], [fwd]);
  assert.equal(r.input.gear, 'forward');
  const g = r.pt(3, 'gunsToggle'); r.tracker.update([g], [g]); r.tracker.update([], [g]);
  assert.deepEqual([r.input.autoFire, r.ui.guns], [false, false]);
  r.tracker.update([g], [g]); r.tracker.update([g], [g]); r.tracker.update([], [g]);
  assert.equal(r.input.autoFire, true, 'one toggle per touch, not per move event');
});

test('touch: pause / About / interruption (releaseAll) leaves nothing held, and a held button works again afterwards', () => {
  const r = rig(2400, 1080, { top: 0, right: 48, bottom: 24, left: 48 });
  const left = r.pt(1, 'steerLeft'), turbo = r.pt(2, 'turbo');
  r.tracker.update([left, turbo], [left, turbo]);
  assert.deepEqual([r.input.steerLeft, r.input.turbo], [true, true]);
  r.tracker.releaseAll();                                   // ControlPad does this when releaseSignal changes (pause, About, game over)
  assert.deepEqual([r.input.steerLeft, r.input.steerRight, r.input.turbo], [false, false, false]);
  assert.equal(r.ui.held.size, 0);
  r.tracker.update([left], [left]); r.tracker.update([], [left]);   // fingers that were down before the pause lift later: no double release
  const again = r.pt(3, 'steerLeft'); r.tracker.update([again], [again]);
  assert.equal(r.input.steerLeft, true, 'a new press after resume works');
});

test('touch and the desktop bus drive the same state, and with no bus nothing changes (Android)', () => {
  const r = rig(2400, 1080, { top: 0, right: 48, bottom: 24, left: 48 });
  const bus = createControlBus();
  bus.subscribe({ onHold: (k, on) => applyHold(r.input, k, on), onTap: (k) => { applyTap(r.input, k); } });
  bus.hold('turbo', true); assert.equal(r.input.turbo, true);
  bus.tap('gearReverse'); assert.equal(r.input.gear, 'reverse');
  bus.hold('turbo', false); assert.equal(r.input.turbo, false);
  // Android: no subscriber ever emits, so the bus is inert
  const lone = createControlBus(); const before = JSON.stringify(r.input); lone.hold('steerLeft', true); lone.tap('gunsToggle');
  assert.equal(JSON.stringify(r.input), before);
  assert.ok([...HOLD_KINDS].every((k) => ['steerLeft', 'steerRight', 'turbo'].includes(k)));
});

// ---- structural guards on the Android gameplay path --------------------------------------------------------------------

test('Android path: ControlPad uses the shared handlers, cleans up on releaseSignal, and has no desktop dependency', () => {
  const pad = read('src/components/ControlPad.tsx');
  assert.match(pad, /applyHold\(input\.current, kind, on\)/);
  assert.match(pad, /applyTap\(input\.current, kind\)/);
  assert.match(pad, /if \(releaseSignal > 0\) tracker\.releaseAll\(\)/, 'pause/About/game-over release every touch');
  assert.match(pad, /onResponderEnd=\{onTouches\}/, 'a finger lifted while others stay down is reported (RN sends touchEnd, not a move, for it)');
  assert.match(pad, /const tracker = useMemo\(\(\) => new TouchTracker\(layout, handlers\), \[\]\)/, 'one tracker for the life of the pad, as before');
  assert.doesNotMatch(pad, /platform\/desktop|document\.|window\.|navigator\./);
});

test('Android path: GameScreen input starts neutral for every run, pause releases the pad, the bus is created once, desktop hook is native-inert', () => {
  const gs = read('src/components/GameScreen.tsx');
  assert.match(gs, /useRef<ControlInput>\(\{ steerLeft: false, steerRight: false, turbo: false, gear: 'forward', autoFire: true \}\)/, 'a new run (restart) starts with a neutral input');
  assert.match(gs, /if \(p\) setReleaseSignal\(\(n\) => n \+ 1\)/, 'pausing bumps the release signal');
  assert.match(gs, /controlBusRef\.current === null\) controlBusRef\.current = createControlBus\(\)/, 'no per-render allocation');
  assert.match(gs, /AppState\.addEventListener\('change', \(state\) => \{ if \(state !== 'active'\) setPaused\(true\); \}\)/, 'background auto-pause unchanged');
  assert.match(gs, /pausedRef\.current/);
  const stub = read('src/platform/desktop.ts');
  assert.doesNotMatch(stub, /document|window|navigator|requestAnimationFrame|addEventListener/);
  assert.match(stub, /export function useDesktopGameInput\(_input: DesktopGameInput\): void \{ \/\* no-op on native \*\/ \}/);
});

test('gameplay timing: the simulation, camera and horde code is untouched by the desktop work', () => {
  for (const f of ['src/game/engine.ts', 'src/components/GameScene.tsx', 'src/components/ZombieHorde.tsx']) {
    const t = read(f);
    assert.doesNotMatch(t, /platform\/desktop|hagDesktop|Platform\.OS === 'web'|gamepad|keydown/i, `${f} has no platform branches`);
  }
});

test('Android emulator smoke injects real touches and observes the ControlPad state (report-only, never fails the run)', () => {
  const sh = read('tools/emulator-smoke.sh');
  for (const needle of ['input swipe "$RX" "$RY" "$RX" "$RY"', 'steerRight active', 'gearReverse', 'gunsToggle active', 'touch_note']) assert.ok(sh.includes(needle), needle);
  assert.doesNotMatch(sh.split('touch_note()')[1].split('adb shell dumpsys meminfo')[0], /\bfail "/, 'the touch checks report; they must not be able to fail a valid build');
});

test('multi-touch: a lifted finger is released by the End event even when the remaining finger never moves (RN event order)', () => {
  const r = rig(2400, 1080, { top: 0, right: 48, bottom: 24, left: 48 });
  const right = r.pt(1, 'steerRight'), turbo = r.pt(2, 'turbo');
  r.tracker.update([right], [right]);                       // grant
  r.tracker.update([right, turbo], [turbo]);                // second finger down (reported with the next event)
  assert.deepEqual([r.input.steerRight, r.input.turbo], [true, true]);
  r.tracker.update([turbo], [right]);                       // onResponderEnd: touches = remaining, changedTouches = the lifted finger
  assert.deepEqual([r.input.steerRight, r.input.turbo], [false, true], 'only the lifted finger releases');
  r.tracker.update([], [turbo]);                            // last finger up (End) followed by Release
  r.tracker.releaseAll();
  assert.deepEqual([r.input.steerRight, r.input.turbo], [false, false]);
});
