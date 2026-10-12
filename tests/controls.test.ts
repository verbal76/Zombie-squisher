import { test } from 'node:test';
import assert from 'node:assert/strict';
import { computeControlLayout, classifyTouch, TouchTracker, TouchKind, TouchPoint, Insets, ARROW_BTN_SIZE, BUTTON_HITSLOP } from '../src/game/controls';

const NO_INSETS: Insets = { top: 0, right: 0, bottom: 0, left: 0 };
const SIZES: [number, number][] = [[640, 360], [800, 360], [915, 412], [1280, 720], [2400, 1080], [2960, 1440]];
const centre = (b: { x: number; y: number; w: number; h: number }): [number, number] => [b.x + b.w / 2, b.y + b.h / 2];
const touch = (id: number, x: number, y: number): TouchPoint => ({ identifier: id, pageX: x, pageY: y });

test('layout keeps every button fully on screen and above system bars at all landscape sizes and insets', () => {
  for (const [w, h] of SIZES) for (const insets of [NO_INSETS, { top: 24, right: 48, bottom: 24, left: 48 }, { top: 0, right: 0, bottom: 48, left: 0 }]) {
    const l = computeControlLayout(w, h, insets);
    for (const b of l.buttons) {
      assert.ok(b.x >= insets.left && b.x + b.w <= w - insets.right, `${b.kind} x-range at ${w}x${h}`);
      assert.ok(b.y >= 0 && b.y + b.h <= h - insets.bottom, `${b.kind} y-range at ${w}x${h}`);
      assert.ok(b.y >= l.overlayTop, `${b.kind} inside overlay`);
      assert.ok(Math.min(b.w, b.h) >= 64, `${b.kind} touch target >= 64 px`);
    }
    assert.equal(l.overlayTop + l.overlayHeight, h);
  }
});

test('buttons never overlap each other', () => {
  for (const [w, h] of SIZES) {
    const bs = computeControlLayout(w, h, NO_INSETS).buttons;
    for (let i = 0; i < bs.length; i++) for (let j = i + 1; j < bs.length; j++) {
      const a = bs[i], b = bs[j];
      const overlap = a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
      assert.ok(!overlap, `${a.kind} overlaps ${b.kind} at ${w}x${h}`);
    }
  }
});

test('thumb reach: LEFT/RIGHT arrows sit in the bottom corners, TURBO/GUNS stack above them', () => {
  const l = computeControlLayout(915, 412, NO_INSETS);
  const by = Object.fromEntries(l.buttons.map((b) => [b.kind, b]));
  assert.ok(by.steerLeft.x < 40 && by.steerRight.x + by.steerRight.w > 915 - 40);
  assert.ok(by.turbo.y + by.turbo.h < by.steerRight.y && by.gunsToggle.y + by.gunsToggle.h < by.steerLeft.y);
  assert.ok(by.steerLeft.w >= ARROW_BTN_SIZE);
});

test('every button centre classifies as itself; far-away touches classify as nothing', () => {
  const l = computeControlLayout(915, 412, NO_INSETS);
  for (const b of l.buttons) assert.equal(classifyTouch(l, ...centre(b)), b.kind);
  assert.equal(classifyTouch(l, 457, 120), null);        // open road in the middle of the screen
  assert.equal(classifyTouch(l, 457, 395), null);        // bottom-centre gap between the clusters
  const left = l.buttons.find((b) => b.kind === 'steerLeft')!;
  assert.equal(classifyTouch(l, left.x - BUTTON_HITSLOP + 1, left.y + 10), 'steerLeft', 'hit slop is honoured');
  assert.equal(classifyTouch(l, left.x - BUTTON_HITSLOP - 2, left.y + 10), null);
});

test('where grown hit areas overlap, the nearest button wins (not array order)', () => {
  const l = computeControlLayout(915, 412, NO_INSETS);
  const left = l.buttons.find((b) => b.kind === 'steerLeft')!, f = l.buttons.find((b) => b.kind === 'gearForward')!;
  const gapMid = (left.x + left.w + f.x) / 2;
  const y = f.y + f.h / 2;
  assert.equal(classifyTouch(l, gapMid - 3, y), 'steerLeft');
  assert.equal(classifyTouch(l, gapMid + 3, y), 'gearForward');
});

function rig() {
  const log: string[] = [];
  const layout = computeControlLayout(915, 412, NO_INSETS);
  const t = new TouchTracker(layout, { onHold: (k, on) => log.push(`${k}:${on ? 'down' : 'up'}`), onTap: (k) => log.push(`${k}:tap`) });
  const at = (k: TouchKind) => centre(layout.buttons.find((b) => b.kind === k)!);
  return { t, log, at };
}

test('hold buttons: down on touch, up on lift; tap buttons fire once per touch', () => {
  const { t, log, at } = rig();
  const l = touch(1, ...at('steerLeft'));
  t.update([l], [l]); assert.deepEqual(log, ['steerLeft:down']);
  t.update([l], [l]); assert.equal(log.length, 1, 'move events do not retrigger');
  t.update([], [l]); assert.deepEqual(log, ['steerLeft:down', 'steerLeft:up']);
  const g = touch(2, ...at('gunsToggle')); t.update([g], [g]); t.update([], [g]);
  assert.deepEqual(log.slice(2), ['gunsToggle:tap']);
});

test('multi-touch: steer + turbo + gear at once, independent release', () => {
  const { t, log, at } = rig();
  const a = touch(1, ...at('steerRight')), b = touch(2, ...at('turbo')), c = touch(3, ...at('gearReverse'));
  t.update([a], [a]); t.update([a, b], [b]); t.update([a, b, c], [c]);
  assert.deepEqual(log, ['steerRight:down', 'turbo:down', 'gearReverse:tap']);
  t.update([b, c], [a]);
  assert.deepEqual(log.slice(3), ['steerRight:up']);
  assert.deepEqual(t.heldKinds, ['turbo']);
});

test('two fingers on one hold button: it stays held until BOTH lift (regression: first lift cancelled the hold)', () => {
  const { t, log, at } = rig();
  const a = touch(1, ...at('steerLeft')), b = touch(2, ...at('steerLeft'));
  t.update([a], [a]); t.update([a, b], [b]);
  assert.deepEqual(log, ['steerLeft:down'], 'no duplicate down');
  t.update([b], [a]); assert.deepEqual(log, ['steerLeft:down'], 'still held by the second finger');
  t.update([], [b]); assert.deepEqual(log, ['steerLeft:down', 'steerLeft:up']);
});

test('touches that start outside any button are ignored and sliding off a held button keeps the hold', () => {
  const { t, log, at } = rig();
  const stray = touch(1, 457, 100); t.update([stray], [stray]); assert.deepEqual(log, []);
  const a = touch(2, ...at('steerLeft')); t.update([stray, a], [a]);
  const slid = touch(2, 457, 200);            // finger drifts onto the road
  t.update([stray, slid], [slid]); assert.deepEqual(log, ['steerLeft:down'], 'hold persists while the finger is down');
  t.update([stray], [slid]); assert.deepEqual(log, ['steerLeft:down', 'steerLeft:up']);
});

test('releaseAll (pause / interruption / responder terminate) lifts every held button exactly once', () => {
  const { t, log, at } = rig();
  const a = touch(1, ...at('steerLeft')), b = touch(2, ...at('turbo'));
  t.update([a, b], [a, b]); log.length = 0;
  t.releaseAll(); t.releaseAll();
  assert.deepEqual(log.sort(), ['steerLeft:up', 'turbo:up']);
  assert.deepEqual(t.heldKinds, []);
});

test('a lost touch event (no fingers reported at all) cannot leave a button stuck', () => {
  const { t, log, at } = rig();
  const a = touch(1, ...at('steerRight')); t.update([a], [a]);
  t.update([], []);                            // OS dropped the end event
  assert.deepEqual(log, ['steerRight:down', 'steerRight:up']);
});
