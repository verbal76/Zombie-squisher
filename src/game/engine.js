// Pure game logic: no React or rendering code, so the renderer can be swapped later.
export const CAR_RADIUS = 18;
export const ZOMBIE_RADIUS = 10;
const MAX_SPEED = 320;
const ACCEL = 260;
const BRAKE = 420;
const DRAG = 90;
const TURN_RATE = 2.6; // radians/sec at full speed
const ZOMBIE_SPEED = 55;
const ZOMBIE_SPEED_GROWTH = 0.4; // px/sec gained per second survived
const MAX_SPLATS = 40;
const SPLAT_TTL = 4;
const SPAWN_RADIUS = 520; // off-screen ring around the car
export const MAX_ZOMBIES = 150;

export function createGame(rng = Math.random) {
  return {
    rng,
    splats: [],
    car: { x: 0, y: 0, angle: -Math.PI / 2, speed: 0, health: 100 },
    zombies: [],
    kills: 0,
    time: 0,
    spawnTimer: 0,
    nextId: 1,
    over: false,
  };
}

// input: { steer: -1..1, gas: bool, brake: bool }
export function step(g, input, dt) {
  if (g.over) return g;
  g.time += dt;
  const c = g.car;

  if (input.gas) c.speed += ACCEL * dt;
  else if (input.brake) c.speed -= BRAKE * dt;
  else c.speed -= Math.sign(c.speed) * Math.min(Math.abs(c.speed), DRAG * dt);
  c.speed = Math.max(-MAX_SPEED / 3, Math.min(MAX_SPEED, c.speed));

  c.angle += input.steer * TURN_RATE * dt * Math.min(1, Math.abs(c.speed) / 100) * Math.sign(c.speed || 1);
  c.x += Math.cos(c.angle) * c.speed * dt;
  c.y += Math.sin(c.angle) * c.speed * dt;

  // Spawn rate escalates quickly: chaos late game.
  const rate = 1 + g.time * 0.15; // zombies per second
  g.spawnTimer += dt * rate;
  while (g.spawnTimer >= 1 && g.zombies.length < MAX_ZOMBIES) {
    g.spawnTimer -= 1;
    const a = g.rng() * Math.PI * 2;
    g.zombies.push({ id: g.nextId++, x: c.x + Math.cos(a) * SPAWN_RADIUS, y: c.y + Math.sin(a) * SPAWN_RADIUS });
  }
  if (g.zombies.length >= MAX_ZOMBIES) g.spawnTimer = 0;

  const zSpeed = Math.min(ZOMBIE_SPEED + g.time * ZOMBIE_SPEED_GROWTH, MAX_SPEED * 0.6);
  const hitDist = CAR_RADIUS + ZOMBIE_RADIUS;
  const alive = [];
  for (const z of g.zombies) {
    const dx = c.x - z.x;
    const dy = c.y - z.y;
    const d = Math.hypot(dx, dy) || 1;
    if (d < hitDist) {
      if (Math.abs(c.speed) > 60) {
        g.kills += 1; // squished
        g.splats.push({ x: z.x, y: z.y, ttl: SPLAT_TTL });
        if (g.splats.length > MAX_SPLATS) g.splats.shift();
        continue;
      }
      c.health -= 20 * dt; // slow car gets mauled
    } else {
      z.x += (dx / d) * zSpeed * dt;
      z.y += (dy / d) * zSpeed * dt;
    }
    alive.push(z);
  }
  g.zombies = alive;
  for (const sp of g.splats) sp.ttl -= dt;
  g.splats = g.splats.filter((sp) => sp.ttl > 0);
  if (c.health <= 0) { c.health = 0; g.over = true; }
  return g;
}
