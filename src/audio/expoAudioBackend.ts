// Real playback via expo-audio. Everything here is best-effort: any failure surfaces as an exception that
// AudioDirector catches (and eventually disables itself on), so audio can never take the game down.
import { AudioPlayer, createAudioPlayer, setAudioModeAsync } from 'expo-audio';
import { AudioBackend, SoundHandle } from './audioDirector';
import { SOUND_SPECS, SoundId } from './soundIds';
import { SOUND_ASSETS } from './sounds';

class PooledHandle implements SoundHandle {
  private players: AudioPlayer[];
  private next = 0;

  constructor(private id: SoundId) {
    const spec = SOUND_SPECS[id];
    this.players = Array.from({ length: spec.voices }, () => {
      const p = createAudioPlayer(SOUND_ASSETS[id]);
      p.loop = spec.loop;
      p.volume = spec.volume;
      return p;
    });
  }

  play(volume: number, rate: number): void {
    const p = this.players[this.next];
    this.next = (this.next + 1) % this.players.length;
    p.volume = volume;
    if (rate !== p.playbackRate) p.setPlaybackRate(rate, 'low');
    if (!SOUND_SPECS[this.id].loop) { p.seekTo(0).catch(() => {}); }
    p.play();
  }
  setVolume(v: number): void { this.players.forEach((p) => { p.volume = v; }); }
  setRate(r: number): void { this.players.forEach((p) => p.setPlaybackRate(r, 'low')); }
  pause(): void { this.players.forEach((p) => p.pause()); }
  stop(): void { this.players.forEach((p) => { p.pause(); }); }
  release(): void { this.players.forEach((p) => p.remove()); this.players = []; }
}

let modeSet = false;
export function createExpoAudioBackend(): AudioBackend {
  if (!modeSet) {
    modeSet = true;
    // Game audio should not keep playing in the background or duck other apps' audio permanently.
    setAudioModeAsync({ playsInSilentMode: false, shouldPlayInBackground: false, interruptionMode: 'mixWithOthers' }).catch(() => {});
  }
  return { create: (id) => new PooledHandle(id) };
}
