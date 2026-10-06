#!/usr/bin/env python3
"""Deterministically synthesises every sound in assets/audio (22.05 kHz mono 16-bit WAV).
No samples are used: all audio is generated here, so it is original, license-free and reproducible.
Usage: python3 tools/synth_audio.py   (requires numpy, scipy)"""
import os, wave
import numpy as np
from scipy.signal import butter, sosfilt, sosfiltfilt

SR = 22050
OUT = os.path.join(os.path.dirname(__file__), '..', 'assets', 'audio')
os.makedirs(OUT, exist_ok=True)
rng = np.random.default_rng(1337)

def t(d): return np.arange(int(SR * d)) / SR
def lp(x, f, o=4): return sosfilt(butter(o, f, 'low', fs=SR, output='sos'), x)
def hp(x, f, o=4): return sosfilt(butter(o, f, 'high', fs=SR, output='sos'), x)
def bp(x, lo, hi, o=3): return sosfilt(butter(o, [lo, hi], 'band', fs=SR, output='sos'), x)
def noise(d): return rng.uniform(-1, 1, int(SR * d))
def env(d, a=0.002, k=8.0):
    n = int(SR * d); e = np.exp(-k * np.arange(n) / n)
    na = max(1, int(SR * a)); e[:na] *= np.linspace(0, 1, na); return e
def sweep(d, f0, f1, shape='exp'):
    tt = t(d); f = f0 * (f1 / f0) ** (tt / d) if shape == 'exp' else np.linspace(f0, f1, len(tt))
    return np.sin(2 * np.pi * np.cumsum(f) / SR)
def saw(f, d): return 2 * ((t(d) * f) % 1) - 1
def square(f, d): return np.sign(np.sin(2 * np.pi * f * t(d)))
def drive(x, g): return np.tanh(g * x) / np.tanh(g)
def norm(x, peak=0.9): return x / (np.max(np.abs(x)) + 1e-9) * peak
def fade_tail(x, ms=8):
    n = int(SR * ms / 1000); x = x.copy(); x[-n:] *= np.linspace(1, 0, n); return x
def save(name, x):
    x = np.clip(x, -1, 1); pcm = (x * 32767).astype('<i2')
    with wave.open(os.path.join(OUT, name + '.wav'), 'wb') as w:
        w.setnchannels(1); w.setsampwidth(2); w.setframerate(SR); w.writeframes(pcm.tobytes())

# ---- engine: seamless 1 s loop of integer-Hz partials, pitch is controlled by playback rate at runtime
tt = t(1.0)
eng = sum(a * (2 * ((tt * f) % 1) - 1) for f, a in [(48, 1.0), (96, 0.55), (144, 0.3), (192, 0.15)])
eng *= 0.75 + 0.25 * np.sin(2 * np.pi * 12 * tt)               # 12 Hz firing pulse
eng += 0.35 * np.sin(2 * np.pi * 24 * tt)
tile = np.tile(eng, 3); tile = sosfiltfilt(butter(3, 1100, 'low', fs=SR, output='sos'), tile)
save('engine_loop', norm(drive(tile[len(eng):2 * len(eng)], 1.6), 0.55))

# ---- squish / crunch (2 variants) and car hit
for i, (f0, d) in enumerate([(170, 0.22), (150, 0.24)], 1):
    thump = sweep(d, f0, 42) * env(d, 0.001, 9)
    crunch = lp(noise(d), 2200) * env(d, 0.001, 22) * 0.9
    pops = bp(noise(d), 400, 3000) * env(d, 0.001, 12) * (rng.uniform(0, 1, int(SR * d)) > 0.93) * 3
    save(f'squish_{i}', fade_tail(norm(drive(thump * 1.2 + crunch + pops * 0.5, 1.8), 0.85)))
for i, base in enumerate([310], 1):
    d = 0.28; tt = t(d)
    ring = sum(np.sin(2 * np.pi * base * m * tt) * np.exp(-tt * k) for m, k in [(1, 14), (1.68, 20), (2.86, 26), (4.1, 32)])
    clank = hp(noise(d), 1200) * env(d, 0.0005, 30) * 0.8
    save(f'hit_{i}', fade_tail(norm(ring * 0.5 + clank + sweep(d, 120, 60) * env(d, 0.001, 14) * 0.7, 0.8)))

# ---- streak sting (rising arpeggio with a little echo)
d = 0.75; sting = np.zeros(int(SR * d))
for k, f in enumerate([329.6, 415.3, 493.9, 659.3]):
    s0 = int(SR * 0.09 * k); n = int(SR * 0.3)
    note = (square(f, 0.3) * 0.5 + saw(f * 2, 0.3) * 0.3) * env(0.3, 0.003, 6)
    sting[s0:s0 + n] += note[:len(sting) - s0]
echo = np.zeros_like(sting); sh = int(SR * 0.16); echo[sh:] = sting[:-sh] * 0.35
save('streak', fade_tail(norm(lp(sting + echo, 5000), 0.7)))

# ---- weapons
save('shot_mg', fade_tail(norm(hp(noise(0.09), 700) * env(0.09, 0.0005, 18) + sweep(0.09, 160, 70) * env(0.09, 0.0005, 12) * 0.9, 0.7)))
save('flame', fade_tail(norm(bp(noise(0.14), 300, 2800) * (0.6 + 0.4 * np.sin(2 * np.pi * 70 * t(0.14))) * env(0.14, 0.01, 4), 0.55)))
d = 0.55; whoosh = lp(noise(d), 3500) * np.sin(np.pi * np.minimum(1, t(d) / d)) ** 1.5
save('rocket', fade_tail(norm(whoosh * 0.9 + sweep(d, 90, 40) * env(d, 0.001, 5) * 0.8, 0.8)))
d = 0.22; save('laser', fade_tail(norm((sweep(d, 2200, 380) + 0.4 * sweep(d, 4400, 760)) * env(d, 0.001, 6), 0.65)))

# ---- abilities
d = 0.9; sv = np.sin(np.pi * np.minimum(1, t(d) / d)); save('nitro', fade_tail(norm(bp(noise(d), 200, 4000) * sv + sweep(d, 80, 260, 'lin') * 0.4 * sv, 0.8)))
d = 0.7; save('shield', fade_tail(norm((sweep(d, 300, 1500, 'lin') + 0.5 * sweep(d, 450, 2250, 'lin')) * env(d, 0.02, 3) * (0.8 + 0.2 * np.sin(2 * np.pi * 9 * t(d))), 0.6)))
d = 0.8; save('emp', fade_tail(norm(sweep(d, 70, 28) * env(d, 0.001, 4) * 1.2 + lp(noise(d), 1800) * env(d, 0.001, 7) * 0.6 + hp(noise(d), 4000) * env(d, 0.001, 20) * 0.3, 0.9)))

# ---- game over + ui
d = 1.5; go = np.zeros(int(SR * d))
for k, f in enumerate([220, 185, 147, 110]):
    s0 = int(SR * 0.22 * k); note = drive(saw(f, 0.5), 2) * env(0.5, 0.005, 5); n = min(len(note), len(go) - s0); go[s0:s0 + n] += note[:n] * 0.6
go += lp(noise(d), 1200) * env(d, 0.001, 6) * 0.5 + sweep(d, 90, 30) * env(d, 0.001, 3) * 0.7
save('gameover', fade_tail(norm(lp(go, 4200), 0.85), 30))
save('ui_click', fade_tail(norm((sweep(0.06, 900, 500) + 0.5 * hp(noise(0.06), 3000)) * env(0.06, 0.0005, 18), 0.6)))

# ---- music: 16 bars @ 150 BPM, E minor "junkyard rock" (kick/snare/hat + driven bass riff + power-chord stabs + lead)
BPM = 150; beat = 60 / BPM; bars = 16; total = bars * 4 * beat
M = np.zeros(int(SR * total) + int(SR * 0.5))
def put(x, at):
    s0 = int(SR * at); n = min(len(x), len(M) - s0)
    if n > 0: M[s0:s0 + n] += x[:n]
kick = sweep(0.22, 130, 42) * env(0.22, 0.001, 9) * 1.1
snare = (bp(noise(0.2), 900, 6000) * env(0.2, 0.001, 14) + sweep(0.2, 220, 150) * env(0.2, 0.001, 18) * 0.5) * 0.7
hat = hp(noise(0.06), 7000) * env(0.06, 0.0005, 20) * 0.3
def bass_note(f, d): return drive(saw(f, d) + 0.5 * saw(f * 1.005, d), 3.0) * env(d, 0.004, 3.5) * 0.55
def stab(f, d): return drive(sum(saw(f * m, d) for m in (1, 1.5, 2)), 2.5) * env(d, 0.003, 5) * 0.28
def lead(f, d): return (square(f, d) * 0.5 + saw(f, d) * 0.25) * env(d, 0.01, 3) * (1 + 0.03 * np.sin(2 * np.pi * 5.5 * t(d))) * 0.3
E1, G1, A1, B1, D2 = 41.2, 49.0, 55.0, 61.7, 73.4
riff_a = [E1, E1, G1, E1, A1, A1, G1, E1]
riff_b = [E1, E1, B1, E1, D2, A1, G1, A1]
pent = [329.6, 392.0, 440.0, 493.9, 587.3, 659.3]
for bar in range(bars):
    b0 = bar * 4 * beat
    for q in range(4):
        put(kick if q in (0, 2) else snare, b0 + q * beat) if q != 3 else put(snare, b0 + q * beat)
        if q == 1: put(snare, b0 + q * beat)
    for e in range(8):
        put(hat, b0 + e * beat / 2)
    if bar % 4 == 3: put(kick, b0 + 3.5 * beat)
    riff = riff_a if (bar // 2) % 2 == 0 else riff_b
    for e in range(8): put(bass_note(riff[e], beat / 2 * 0.92), b0 + e * beat / 2)
    if bar % 2 == 0: put(stab(164.8, beat * 1.6), b0); put(stab(164.8, beat * 0.8), b0 + 2.5 * beat)
    if bar >= 8:
        seq = [0, 2, 3, 2, 4, 3, 2, 1] if bar % 2 == 0 else [5, 4, 3, 4, 2, 3, 1, 0]
        for e in range(8): put(lead(pent[seq[e]], beat / 2 * 0.9), b0 + e * beat / 2)
M = M[:int(SR * total)]
M = lp(drive(M, 1.3), 9000)
fade = int(SR * 0.01); M[:fade] *= np.linspace(0, 1, fade); M[-fade:] *= np.linspace(1, 0, fade)   # click-free loop seam
save('music_loop', norm(M, 0.8))
print('wrote', sorted(f for f in os.listdir(OUT) if f.endswith('.wav')))
