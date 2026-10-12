// Headless gameplay balance probe: plays the real engine with simple bot drivers.
// Usage: node --import tsx tools/simulate.ts [trials] [maxSeconds]
import { createWorld, step, deriveStats, UpdateInput, World, MAX_ACTIVE_ZOMBIES } from '../src/game/engine';
import { DEFAULT_PROGRESS } from '../src/store/progressLogic';
import { Progress, VehicleId } from '../src/types';

function seeded(seed: number) { let s = seed; return () => ((s = (s * 16807) % 2147483647) - 1) / 2147483646; }

type Policy = (w: World) => UpdateInput;
const base: UpdateInput = { steerLeft: false, steerRight: false, gear: 'forward', turbo: false, fire: true, triggerAbility: false };

const policies: Record<string, Policy> = {
  idle: () => ({ ...base, gear: 'neutral' }),
  straight: () => base,
  circle: () => ({ ...base, steerRight: true }),
  // steer toward the densest nearby cluster ahead of the car
  hunter: (w) => {
    let best: { x: number; y: number } | null = null, bestD = 1e18;
    for (const z of w.zombies) { const d = (z.x - w.carX) ** 2 + (z.y - w.carY) ** 2; if (d < bestD) { bestD = d; best = z; } }
    if (!best) return base;
    const desired = Math.atan2(best.x - w.carX, -(best.y - w.carY));
    let diff = desired - w.heading; while (diff > Math.PI) diff -= 2 * Math.PI; while (diff < -Math.PI) diff += 2 * Math.PI;
    return { ...base, steerRight: diff > 0.1, steerLeft: diff < -0.1, turbo: false };
  },
};

function run(vehicle: VehicleId, policy: string, seed: number, maxS: number) {
  const orig = Math.random; Math.random = seeded(seed);
  try {
    const p: Progress = JSON.parse(JSON.stringify(DEFAULT_PROGRESS)); p.selectedVehicle = vehicle;
    const w = createWorld(1200, 1200, p);
    const dt = 1 / 60; let t = 0, capAt = -1, peak = 0;
    while (!w.gameOver && t < maxS) {
      step(w, dt, policies[policy](w), p); t += dt;
      peak = Math.max(peak, w.zombies.length);
      if (capAt < 0 && w.zombies.length >= MAX_ACTIVE_ZOMBIES) capAt = t;
    }
    return { t, kills: w.kills, wave: w.wave, capAt, peak, survived: !w.gameOver, best: w.bestStreak };
  } finally { Math.random = orig; }
}

const trials = Number(process.argv[2] ?? 8), maxS = Number(process.argv[3] ?? 300);
const mean = (a: number[]) => a.reduce((x, y) => x + y, 0) / a.length;
console.log(`vehicle   policy    survive_s  kills  kills/min  wave  cap_at_s  survivedFull  (trials=${trials}, max=${maxS}s)`);
for (const v of ['hatchback', 'sedan', 'tank'] as VehicleId[]) {
  for (const pol of Object.keys(policies)) {
    const rs = Array.from({ length: trials }, (_, i) => run(v, pol, 1000 + i, maxS));
    const caps = rs.map((r) => r.capAt).filter((c) => c >= 0);
    console.log(
      v.padEnd(9), pol.padEnd(9),
      mean(rs.map((r) => r.t)).toFixed(1).padStart(8),
      mean(rs.map((r) => r.kills)).toFixed(0).padStart(7),
      (mean(rs.map((r) => r.kills)) / (mean(rs.map((r) => r.t)) / 60)).toFixed(0).padStart(9),
      mean(rs.map((r) => r.wave)).toFixed(1).padStart(6),
      (caps.length ? mean(caps).toFixed(1) : 'never').padStart(8),
      `${rs.filter((r) => r.survived).length}/${trials}`.padStart(8),
    );
  }
}
const s = deriveStats(JSON.parse(JSON.stringify(DEFAULT_PROGRESS)));
console.log('hatchback stats', JSON.stringify(s.stats));
