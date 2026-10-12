// Sound catalogue (pure data, no asset requires so it is testable in Node). The require() map that binds
// ids to bundled files lives in sounds.ts. Every sound is synthesised by tools/synth_audio.py.

export type SoundId =
  | 'engine_loop' | 'music_loop'
  | 'squish_1' | 'squish_2' | 'hit_1' | 'streak'
  | 'shot_mg' | 'flame' | 'rocket' | 'laser'
  | 'nitro' | 'shield' | 'emp' | 'gameover' | 'ui_click';

export interface SoundSpec {
  /** Simultaneous copies that may overlap (a pool of native players is created lazily). */
  voices: number;
  loop: boolean;
  /** Base volume 0..1 before per-play scaling; balances the mix (engine/music sit under impacts). */
  volume: number;
}

export const SOUND_SPECS: Record<SoundId, SoundSpec> = {
  engine_loop: { voices: 1, loop: true,  volume: 0.30 },
  music_loop:  { voices: 1, loop: true,  volume: 0.38 },
  squish_1:    { voices: 2, loop: false, volume: 0.85 },
  squish_2:    { voices: 2, loop: false, volume: 0.85 },
  hit_1:       { voices: 2, loop: false, volume: 0.80 },
  streak:      { voices: 1, loop: false, volume: 0.80 },
  shot_mg:     { voices: 2, loop: false, volume: 0.40 },
  flame:       { voices: 2, loop: false, volume: 0.40 },
  rocket:      { voices: 2, loop: false, volume: 0.75 },
  laser:       { voices: 2, loop: false, volume: 0.60 },
  nitro:       { voices: 1, loop: false, volume: 0.80 },
  shield:      { voices: 1, loop: false, volume: 0.70 },
  emp:         { voices: 1, loop: false, volume: 0.95 },
  gameover:    { voices: 1, loop: false, volume: 0.90 },
  ui_click:    { voices: 2, loop: false, volume: 0.60 },
};

export const ALL_SOUND_IDS = Object.keys(SOUND_SPECS) as SoundId[];
