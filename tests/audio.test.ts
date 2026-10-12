import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { AudioBackend, AudioDirector, SoundHandle, MIN_INTERVAL_MS } from '../src/audio/audioDirector';
import { ALL_SOUND_IDS, SOUND_SPECS, SoundId } from '../src/audio/soundIds';
import { createWorld, World } from '../src/game/engine';
import { DEFAULT_PROGRESS } from '../src/store/progressLogic';
import { DEFAULT_SETTINGS, sanitizeSettings } from '../src/store/settingsLogic';

const root = path.resolve(__dirname, '..');

// ---------- the synthesised assets themselves ----------
function readWav(file: string) {
  const b = fs.readFileSync(file);
  assert.equal(b.toString('latin1', 0, 4), 'RIFF');
  assert.equal(b.toString('latin1', 8, 12), 'WAVE');
  const channels = b.readUInt16LE(22), rate = b.readUInt32LE(24), bits = b.readUInt16LE(34);
  let off = 12, dataOff = 0, dataLen = 0;
  while (off < b.length - 8) {
    const id = b.toString('latin1', off, off + 4), len = b.readUInt32LE(off + 4);
    if (id === 'data') { dataOff = off + 8; dataLen = len; break; }
    off += 8 + len;
  }
  const n = dataLen / 2, x = new Float32Array(n);
  for (let i = 0; i < n; i++) x[i] = b.readInt16LE(dataOff + i * 2) / 32768;
  return { channels, rate, bits, x, seconds: n / rate };
}

test('every sound id has an asset file and every file is used', () => {
  const dir = path.join(root, 'assets/audio');
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.wav')).map((f) => f.replace('.wav', '')).sort();
  assert.deepEqual(files, [...ALL_SOUND_IDS].sort());
  const sounds = fs.readFileSync(path.join(root, 'src/audio/sounds.ts'), 'utf8');
  for (const id of ALL_SOUND_IDS) assert.match(sounds, new RegExp(`${id}: require\\('../../assets/audio/${id}\\.wav'\\)`));
});

test('audio assets are valid: mono 22.05 kHz 16-bit, audible, unclipped, DC-free, click-free ends', () => {
  for (const id of ALL_SOUND_IDS) {
    const w = readWav(path.join(root, `assets/audio/${id}.wav`));
    assert.equal(w.channels, 1, id); assert.equal(w.rate, 22050, id); assert.equal(w.bits, 16, id);
    let peak = 0, sum = 0, sq = 0;
    for (const v of w.x) { peak = Math.max(peak, Math.abs(v)); sum += v; sq += v * v; }
    const rms = Math.sqrt(sq / w.x.length), dc = Math.abs(sum / w.x.length);
    assert.ok(peak > 0.3, `${id} too quiet (peak ${peak.toFixed(2)})`);
    assert.ok(peak <= 0.95, `${id} clips (peak ${peak.toFixed(2)})`);
    assert.ok(rms > 0.02, `${id} nearly silent (rms ${rms.toFixed(3)})`);
    assert.ok(dc < 0.03, `${id} DC offset ${dc.toFixed(3)}`);
    if (!SOUND_SPECS[id].loop) assert.ok(Math.abs(w.x[w.x.length - 1]) < 0.02, `${id} ends with a click`);
  }
});

test('loops: engine loop is seamless, music is exactly 16 bars at 150 BPM and has a steady beat', () => {
  const eng = readWav(path.join(root, 'assets/audio/engine_loop.wav'));
  const step = Math.max(...Array.from({ length: 200 }, (_, i) => Math.abs(eng.x[i + 1] - eng.x[i])));
  assert.ok(Math.abs(eng.x[0] - eng.x[eng.x.length - 1]) <= step * 1.5 + 0.02, 'engine seam discontinuity');
  const mus = readWav(path.join(root, 'assets/audio/music_loop.wav'));
  assert.ok(Math.abs(mus.seconds - 16 * 4 * (60 / 150)) < 0.01, `music is ${mus.seconds}s`);
  // beat grid: energy at quarter-note boundaries must exceed energy halfway between them (kick/snare on the beat)
  const beat = Math.round(mus.rate * 60 / 150); let on = 0, off = 0;
  for (let k = 0; k < 60; k++) for (let i = 0; i < 400; i++) { on += Math.abs(mus.x[k * beat + i]); off += Math.abs(mus.x[k * beat + (beat >> 1) + 200 + i]); }
  assert.ok(on > off * 0.9, `no beat structure (on ${on.toFixed(1)} off ${off.toFixed(1)})`);
});

// ---------- the director ----------
class FakeHandle implements SoundHandle {
  plays: { volume: number; rate: number }[] = []; rates: number[] = []; paused = 0; released = 0;
  constructor(public id: SoundId, private fail: boolean) {}
  play(volume: number, rate: number) { if (this.fail) throw new Error('boom'); this.plays.push({ volume, rate }); }
  setVolume() {} setRate(r: number) { this.rates.push(r); } pause() { this.paused++; } stop() {} release() { this.released++; }
}
function rig(opts: { sfx?: boolean; music?: boolean; fail?: boolean } = {}) {
  const handles = new Map<SoundId, FakeHandle>(); let t = 1000; const errors: string[] = [];
  const backend: AudioBackend = { create: (id) => { const h = new FakeHandle(id, !!opts.fail); handles.set(id, h); return h; } };
  const d = new AudioDirector(backend, { sfx: opts.sfx ?? true, music: opts.music ?? true }, () => t, () => 0.5, (w) => errors.push(w));
  const w: World = createWorld(1200, 1200, JSON.parse(JSON.stringify(DEFAULT_PROGRESS)));
  const view = () => ({ world: w, maxSpeed: 220, ability: 'none' as const });
  return { d, w, handles, errors, view, advance: (ms: number) => { t += ms; }, plays: (id: SoundId) => handles.get(id)?.plays.length ?? 0 };
}

test('start() begins music and engine; events from before the run never replay', () => {
  const r = rig(); r.w.kills = 50; r.w.hitCount = 9;
  r.d.start(r.w); r.d.update(r.view());
  assert.equal(r.plays('music_loop'), 1); assert.equal(r.plays('engine_loop'), 1);
  assert.equal(r.plays('squish_1') + r.plays('squish_2') + r.plays('hit_1'), 0);
});

test('kills play crunches, alternate variants and are throttled during a massacre', () => {
  const r = rig(); r.d.start(r.w);
  for (let i = 0; i < 60; i++) { r.w.kills += 1; r.d.update(r.view()); r.advance(8); }       // 60 kills in ~0.5 s
  const total = r.plays('squish_1') + r.plays('squish_2');
  assert.ok(total >= 5 && total <= Math.ceil(480 / MIN_INTERVAL_MS.squish_1!) + 1, `crunches ${total}`);
  assert.ok(r.plays('squish_1') > 0 && r.plays('squish_2') > 0, 'variants alternate');
});

test('damage, weapons, streaks, abilities and game over each trigger their sound once', () => {
  const r = rig(); r.d.start(r.w);
  r.w.hitCount += 1; r.w.shotCount += 1; r.w.lastShotKind = 'rocket';
  r.w.streakBannerKind = 'spree'; r.w.streakBannerAt = 12345;
  r.w.abilityCooldown = 8000;
  const v = { ...r.view(), ability: 'emp' as const };
  r.d.update(v); r.d.update(v);
  assert.equal(r.plays('hit_1'), 1); assert.equal(r.plays('rocket'), 1);
  assert.equal(r.plays('streak'), 1); assert.equal(r.plays('emp'), 1);
  r.w.gameOver = true; r.d.update(r.view()); r.d.update(r.view());
  assert.equal(r.plays('gameover'), 1);
  assert.ok(r.handles.get('engine_loop')!.paused >= 1, 'engine stops at game over');
});

test('engine pitch follows speed and stays within range', () => {
  const r = rig(); r.d.start(r.w);
  r.w.forwardV = 0; for (let i = 0; i < 40; i++) r.d.update(r.view());
  const idle = r.handles.get('engine_loop')!.rates.at(-1)!;
  r.w.forwardV = 220; for (let i = 0; i < 80; i++) r.d.update(r.view());
  const fast = r.handles.get('engine_loop')!.rates.at(-1)!;
  assert.ok(fast > idle + 0.5, `idle ${idle} fast ${fast}`);
  for (const x of r.handles.get('engine_loop')!.rates) assert.ok(x >= 0.7 && x <= 2.2);
});

test('pause silences loops and blocks sfx; resume restores them (background/foreground)', () => {
  const r = rig(); r.d.start(r.w); r.d.update(r.view());
  r.d.pause();
  assert.ok(r.handles.get('music_loop')!.paused >= 1);
  r.w.kills += 3; r.d.update(r.view()); r.d.click();
  assert.equal(r.plays('squish_1') + r.plays('ui_click'), 0, 'nothing plays while paused');
  r.d.resume();
  assert.equal(r.plays('music_loop'), 2); assert.equal(r.plays('engine_loop'), 2);
});

test('settings: muting sfx removes effects + engine but keeps music; muting music pauses it; live toggling works', () => {
  const r = rig({ sfx: false }); r.d.start(r.w);
  r.w.kills += 1; r.d.update(r.view());
  assert.equal(r.plays('squish_1') + r.plays('squish_2') + r.plays('engine_loop'), 0);
  assert.equal(r.plays('music_loop'), 1);
  r.d.setSettings({ sfx: true, music: false });
  assert.ok(r.handles.get('music_loop')!.paused >= 1); assert.equal(r.plays('engine_loop'), 1);
});

test('a broken audio backend never throws into the game and disables itself instead of retrying forever', () => {
  const r = rig({ fail: true });
  assert.doesNotThrow(() => { r.d.start(r.w); for (let i = 0; i < 200; i++) { r.w.kills += 1; r.d.update(r.view()); r.advance(100); } });
  assert.equal(r.d.isDisabled, true);
  assert.ok(r.errors.length > 0 && r.errors.length < 30, `errors ${r.errors.length}`);
  assert.doesNotThrow(() => { r.d.pause(); r.d.resume(); r.d.dispose(); });
});

test('dispose releases every player', () => {
  const r = rig(); r.d.start(r.w); r.w.kills += 1; r.d.update(r.view()); r.d.dispose();
  for (const h of r.handles.values()) assert.equal(h.released, 1);
});

test('settings sanitising repairs corrupt data and defaults to everything on', () => {
  assert.deepEqual(sanitizeSettings(undefined), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings('x'), DEFAULT_SETTINGS);
  assert.deepEqual(sanitizeSettings({ sfx: false, music: 'no' }), { sfx: false, music: true });
});

test('prewarm creates players one at a time in the background, and dispose cancels pending ones', async () => {
  const { mock } = await import('node:test');
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const r = rig(); r.d.start(r.w);
    const base = r.handles.size;                 // start() already created the two loops
    r.d.prewarm(['squish_1', 'hit_1', 'streak'], 100);
    assert.equal(r.handles.size, base, 'nothing is created synchronously');
    mock.timers.tick(100); assert.equal(r.handles.size, base + 1);
    mock.timers.tick(100); assert.equal(r.handles.size, base + 2);
    r.d.dispose();
    mock.timers.tick(1000); assert.equal(r.handles.size, base + 2, 'disposed director creates nothing more');
  } finally { mock.timers.reset(); }
});
