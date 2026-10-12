// Turns game state into sound. Pure TypeScript: the playback backend is injected, so all behaviour
// (throttling, voice pooling, engine pitch, pause/mute, failure isolation) is unit tested in Node.
//
// Rules this class guarantees:
//  - audio never throws into the game: every backend call is guarded; after repeated failures the
//    director disables itself instead of retrying every frame
//  - a 30-kills-per-second horde cannot spawn 30 sounds: per-sound minimum intervals + voice pools
//  - pause / background silences everything including loops; resume restores them
//  - settings (sfx / music) can change at any moment
import type { World } from '../game/engine';
import type { AbilityId } from '../types';
import { SOUND_SPECS, SoundId } from './soundIds';

export interface SoundHandle {
  play(volume: number, rate: number): void;
  setVolume(volume: number): void;
  setRate(rate: number): void;
  pause(): void;
  stop(): void;
  release(): void;
}

export interface AudioBackend {
  create(id: SoundId): SoundHandle;
}

export interface AudioSettings {
  sfx: boolean;
  music: boolean;
}

export const MIN_INTERVAL_MS: Partial<Record<SoundId, number>> = {
  squish_1: 45, squish_2: 45, hit_1: 140, shot_mg: 110, flame: 130, rocket: 150, laser: 120,
  streak: 400, nitro: 500, shield: 500, emp: 500, ui_click: 40,
};

// Variants of one effect share a throttle so alternating between them cannot double the rate.
const THROTTLE_GROUP: Partial<Record<SoundId, string>> = { squish_1: 'squish', squish_2: 'squish' };

const MAX_FAILURES = 8;
const ENGINE_MIN_RATE = 0.7;
const ENGINE_MAX_RATE = 2.2;

export interface AudioView {
  world: World;
  /** Vehicle top speed used to scale engine pitch. */
  maxSpeed: number;
  ability: AbilityId;
}

export class AudioDirector {
  private handles = new Map<SoundId, SoundHandle>();
  private lastPlayed = new Map<string, number>();
  private failures = 0;
  private disabled = false;
  private paused = false;
  private started = false;
  private musicPlaying = false;
  private enginePlaying = false;
  private engineRate = ENGINE_MIN_RATE;
  private seen = { kills: 0, hits: 0, shots: 0, banner: 0, cooldown: 0, over: false };
  private squishFlip = 0;
  private timers: ReturnType<typeof setTimeout>[] = [];

  constructor(
    private backend: AudioBackend,
    private settings: AudioSettings,
    private now: () => number = () => Date.now(),
    private rng: () => number = Math.random,
    private onError: (where: string, err: unknown) => void = () => {},
  ) {}

  get isDisabled(): boolean { return this.disabled; }

  /** Begins a run: snapshots counters (so earlier events never replay) and starts loops. */
  start(w: World): void {
    this.seen = { kills: w.kills, hits: w.hitCount, shots: w.shotCount, banner: w.streakBannerAt, cooldown: w.abilityCooldown, over: w.gameOver };
    this.started = true;
    this.syncLoops();
  }

  setSettings(s: AudioSettings): void {
    this.settings = s;
    this.syncLoops();
  }

  pause(): void {
    this.paused = true;
    this.guard('pause', () => { this.handles.forEach((h) => h.pause()); });
    this.musicPlaying = false;
    this.enginePlaying = false;
  }

  resume(): void {
    this.paused = false;
    this.syncLoops();
  }

  /**
   * Creates the native players for `ids` one at a time in the background so the first kill / shot in a run
   * does not stall the frame that triggers it.
   */
  prewarm(ids: SoundId[], gapMs = 120): void {
    ids.forEach((id, i) => {
      this.timers.push(setTimeout(() => { if (!this.disabled && this.started) this.guard(`prewarm ${id}`, () => this.handle(id)); }, gapMs * (i + 1)));
    });
  }

  /** One-shot UI feedback (menus, pause overlay). */
  click(): void { this.playOnce('ui_click', 1, 1); }

  update(view: AudioView): void {
    if (!this.started || this.disabled || this.paused) return;
    const { world: w } = view;

    if (w.gameOver) {
      if (!this.seen.over) { this.seen.over = true; this.stopLoops(); this.playOnce('gameover', 1, 1); }
      return;
    }

    // kills -> crunch (volume grows a little with a multi-kill frame)
    if (w.kills > this.seen.kills) {
      const delta = w.kills - this.seen.kills;
      this.seen.kills = w.kills;
      const id: SoundId = (this.squishFlip & 1) === 0 ? 'squish_1' : 'squish_2';
      // only advance the variant when a sound really played, otherwise throttled kills would pin one variant
      if (this.playOnce(id, Math.min(1, 0.7 + 0.1 * delta), 0.9 + this.rng() * 0.25)) this.squishFlip++;
    }
    if (w.hitCount > this.seen.hits) { this.seen.hits = w.hitCount; this.playOnce('hit_1', 1, 0.92 + this.rng() * 0.16); }
    if (w.shotCount > this.seen.shots) {
      this.seen.shots = w.shotCount;
      const kind = w.lastShotKind;
      if (kind === 'mg') this.playOnce('shot_mg', 1, 0.95 + this.rng() * 0.1);
      else if (kind === 'flame') this.playOnce('flame', 1, 0.95 + this.rng() * 0.1);
      else if (kind === 'rocket') this.playOnce('rocket', 1, 1);
      else if (kind === 'laser') this.playOnce('laser', 1, 1);
    }
    if (w.streakBannerAt !== this.seen.banner && w.streakBannerKind) {
      this.seen.banner = w.streakBannerAt;
      this.playOnce('streak', 1, 1);
    }
    // ability fired: its cooldown just jumped up
    if (w.abilityCooldown > this.seen.cooldown + 1) {
      if (view.ability === 'nitro') this.playOnce('nitro', 1, 1);
      else if (view.ability === 'shield') this.playOnce('shield', 1, 1);
      else if (view.ability === 'emp') this.playOnce('emp', 1, 1);
    }
    this.seen.cooldown = w.abilityCooldown;

    this.updateEngine(Math.abs(w.forwardV) / Math.max(1, view.maxSpeed), w.abilityActive > 0);
  }

  dispose(): void {
    this.started = false;
    this.timers.forEach(clearTimeout);
    this.timers = [];
    this.guard('dispose', () => { this.handles.forEach((h) => { h.stop(); h.release(); }); });
    this.handles.clear();
  }

  // ---- internals

  private updateEngine(speedRatio: number, boosted: boolean): void {
    if (!this.settings.sfx || !this.enginePlaying) return;
    const target = ENGINE_MIN_RATE + (ENGINE_MAX_RATE - ENGINE_MIN_RATE) * Math.min(1, speedRatio * 0.85) + (boosted ? 0.2 : 0);
    this.engineRate += (target - this.engineRate) * 0.15;
    this.guard('engine', () => this.handle('engine_loop').setRate(Math.min(ENGINE_MAX_RATE, Math.max(ENGINE_MIN_RATE, this.engineRate))));
  }

  private syncLoops(): void {
    if (this.disabled || this.paused || !this.started) return;
    const wantMusic = this.settings.music;
    const wantEngine = this.settings.sfx && !this.seen.over;
    if (wantMusic && !this.musicPlaying) { this.musicPlaying = true; this.guard('music', () => this.handle('music_loop').play(SOUND_SPECS.music_loop.volume, 1)); }
    if (!wantMusic && this.musicPlaying) { this.musicPlaying = false; this.guard('music', () => this.handle('music_loop').pause()); }
    if (wantEngine && !this.enginePlaying) { this.enginePlaying = true; this.engineRate = ENGINE_MIN_RATE; this.guard('engine', () => this.handle('engine_loop').play(SOUND_SPECS.engine_loop.volume, this.engineRate)); }
    if (!wantEngine && this.enginePlaying) { this.enginePlaying = false; this.guard('engine', () => this.handle('engine_loop').pause()); }
  }

  private stopLoops(): void {
    this.guard('stopLoops', () => { this.handles.get('engine_loop')?.pause(); this.handles.get('music_loop')?.pause(); });
    this.enginePlaying = false;
    this.musicPlaying = false;
  }

  private playOnce(id: SoundId, gain: number, rate: number): boolean {
    if (this.disabled || this.paused || !this.settings.sfx) return false;
    const t = this.now();
    const min = MIN_INTERVAL_MS[id] ?? 0;
    const key = THROTTLE_GROUP[id] ?? id;
    const last = this.lastPlayed.get(key);
    if (last !== undefined && t - last < min) return false;
    this.lastPlayed.set(key, t);
    this.guard(id, () => this.handle(id).play(Math.min(1, SOUND_SPECS[id].volume * gain), rate));
    return true;
  }

  private handle(id: SoundId): SoundHandle {
    let h = this.handles.get(id);
    if (!h) { h = this.backend.create(id); this.handles.set(id, h); }
    return h;
  }

  private guard(where: string, fn: () => void): void {
    try { fn(); } catch (err) {
      this.failures++;
      this.onError(where, err);
      if (this.failures >= MAX_FAILURES) this.disabled = true;   // stop retrying a broken audio stack
    }
  }
}
