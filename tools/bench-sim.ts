// CPU cost of the shared simulation step at the 500-zombie cap (the part of frame time that is identical on every
// platform). Run: node --import tsx tools/bench-sim.ts   -- reports ms per step; says nothing about GPU/render cost.
import { createWorld, step } from '../src/game/engine';
import { DEFAULT_PROGRESS } from '../src/store/progressLogic';

const progress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS));
const w = createWorld(1200, 1200, progress);
const input = { steerLeft: false, steerRight: true, gear: 'forward' as const, turbo: false, fire: true, triggerAbility: false };
let t = 0;
while (w.zombies.length < 500 && t < 3600 && !w.gameOver) { step(w, 1 / 60, input, progress); t++; }
const warm = w.zombies.length;
const times: number[] = [];
for (let i = 0; i < 1200 && !w.gameOver; i++) { const a = process.hrtime.bigint(); step(w, 1 / 60, input, progress); times.push(Number(process.hrtime.bigint() - a) / 1e6); if (w.hp < 5) w.hp = w.maxHp; }
times.sort((a, b) => a - b);
const avg = times.reduce((a, b) => a + b, 0) / times.length;
console.log(`zombies at start of sample: ${warm}, at end: ${w.zombies.length}, steps sampled: ${times.length}`);
console.log(`sim step ms: avg=${avg.toFixed(3)} p95=${times[Math.floor(times.length * 0.95)].toFixed(3)} p99=${times[Math.floor(times.length * 0.99)].toFixed(3)} max=${times.at(-1)!.toFixed(3)}  (budget at 60 fps: 16.7 ms for everything)`);
