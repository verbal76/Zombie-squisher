// Binds sound ids to the bundled WAV files (synthesised by tools/synth_audio.py).
import { SoundId } from './soundIds';

export const SOUND_ASSETS: Record<SoundId, number> = {
  engine_loop: require('../../assets/audio/engine_loop.wav'),
  music_loop: require('../../assets/audio/music_loop.wav'),
  squish_1: require('../../assets/audio/squish_1.wav'),
  squish_2: require('../../assets/audio/squish_2.wav'),
  hit_1: require('../../assets/audio/hit_1.wav'),
  streak: require('../../assets/audio/streak.wav'),
  shot_mg: require('../../assets/audio/shot_mg.wav'),
  flame: require('../../assets/audio/flame.wav'),
  rocket: require('../../assets/audio/rocket.wav'),
  laser: require('../../assets/audio/laser.wav'),
  nitro: require('../../assets/audio/nitro.wav'),
  shield: require('../../assets/audio/shield.wav'),
  emp: require('../../assets/audio/emp.wav'),
  gameover: require('../../assets/audio/gameover.wav'),
  ui_click: require('../../assets/audio/ui_click.wav'),
};
