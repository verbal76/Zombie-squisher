import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { Matrix4, Vector3, Group, Mesh, BoxGeometry, MeshBasicMaterial } from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { stripExternalImageUris, prepareScene, bakeVertexColors } from '../src/render/glbCommon';
import { mergeCharacterGeometry, composeZombieMatrix, composeGroundDiscMatrix, headingFromVelocity, ZOMBIE_TINT } from '../src/render/hordeGeometry';
import { createWorld, step, MAX_BLOOD_SPOTS, UpdateInput } from '../src/game/engine';
import { bakeCharacters, BAKED_PATH } from '../tools/bake-characters';
import { buildZombieModels } from '../src/render/zombieModels';
import { CHARACTER_IDS } from '../src/assets/characters';
import { DEFAULT_PROGRESS } from '../src/store/progressLogic';

const root = path.resolve(__dirname, '..');
const abuf = (f: string): ArrayBuffer => { const b = fs.readFileSync(path.join(root, f)); return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer; };
const parse = (f: string) => new Promise<any>((res, rej) => new GLTFLoader().parse(stripExternalImageUris(abuf(f)), '', res, rej));
const flatPalette = { sample: () => [0.2, 0.6, 0.3] as [number, number, number] };

const CHARS = 'abcdefghijklmnopqr'.split('');

test('every character GLB parses on the runtime path, bakes colours and merges to one draw call', async () => {
  for (const id of CHARS) {
    const gltf = await parse(`assets-source/characters/character-${id}.glb`);
    prepareScene(gltf.scene);
    bakeVertexColors(gltf.scene, flatPalette);
    const merged = mergeCharacterGeometry(gltf.scene);
    assert.ok(merged.triangles > 20 && merged.triangles < 500, `${id}: ${merged.triangles} triangles`);
    assert.ok(Number.isFinite(merged.minY), `${id} minY`);
    assert.equal(merged.geometry.getAttribute('position').count, merged.triangles * 3);
    assert.equal(merged.geometry.getAttribute('color').count, merged.triangles * 3);
    assert.equal(merged.geometry.index, null);
    const bb = merged.geometry.boundingBox!;
    assert.ok(bb.max.y - bb.min.y > 0.5, `${id} has height`);
  }
});

test('every player vehicle GLB parses and has a sane size', async () => {
  const src = fs.readFileSync(path.join(root, 'src/data/objects.ts'), 'utf8');
  const block = src.match(/VEHICLE_GLB[\s\S]*?\n};/)![0];
  const files = [...block.matchAll(/assets\/([\w-]+\.glb)/g)].map((m) => m[1]);
  assert.equal(files.length, 10);
  for (const f of files) {
    const gltf = await parse(`assets/${f}`);
    prepareScene(gltf.scene);
    let meshes = 0; gltf.scene.traverse((n: any) => { if (n.isMesh) meshes++; });
    assert.ok(meshes >= 3, `${f} has ${meshes} meshes`);
    assert.ok(gltf.scene.children.length > 0);
  }
});

test('sanitiser leaves no texture or image references (they crash the renderer on RN)', () => {
  const buf = stripExternalImageUris(abuf('assets-source/characters/character-a.glb'));
  const dv = new DataView(buf);
  const jsonLen = dv.getUint32(12, true);
  const json = JSON.parse(new TextDecoder().decode(new Uint8Array(buf, 20, jsonLen)));
  assert.deepEqual(json.images ?? [], []);
  assert.deepEqual(json.textures ?? [], []);
  assert.equal(dv.getUint32(8, true), buf.byteLength, 'GLB length header must match the rebuilt buffer');
});

test('merge bakes node transforms and handles indexed + non-indexed meshes', () => {
  const g = new Group();
  const a = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial());
  a.position.set(0, 5, 0);
  const b = new Mesh(new BoxGeometry(1, 1, 1).toNonIndexed(), new MeshBasicMaterial());
  b.position.set(0, -2, 0);
  g.add(a, b);
  const m = mergeCharacterGeometry(g);
  assert.equal(m.triangles, 24);
  assert.ok(Math.abs(m.minY - -2.5) < 1e-6);
  assert.ok(Math.abs(m.geometry.boundingBox!.max.y - 5.5) < 1e-6);
  assert.throws(() => mergeCharacterGeometry(new Group()), /no mesh geometry/);
});

test('zombie instance matrix places, rotates and scales correctly', () => {
  const M = composeZombieMatrix(new Matrix4(), 10, 2, -7, Math.PI / 2, 3);
  const p = new Vector3(1, 1, 0).applyMatrix4(M); // local +X rotated 90deg about Y -> world -Z
  assert.ok(Math.abs(p.x - 10) < 1e-9 && Math.abs(p.y - 5) < 1e-9 && Math.abs(p.z - (-7 - 3)) < 1e-9, p.toArray().join());
  const d = composeGroundDiscMatrix(new Matrix4(), 4, 0.5, 9, 2);
  const q = new Vector3(1, 0, 0).applyMatrix4(d);
  assert.deepEqual([q.x, q.y, q.z].map((v) => +v.toFixed(6)), [6, 0.5, 9]);
  const up = new Vector3(0, 0, 1).transformDirection(d); // disc normal points up
  assert.ok(up.y > 0.99);
});

test('heading follows velocity and keeps the fallback when still', () => {
  assert.equal(headingFromVelocity(0, 0, 1.5), 1.5);
  assert.ok(Math.abs(headingFromVelocity(1, 0) - Math.PI / 2) < 1e-9);
  assert.ok(Math.abs(headingFromVelocity(0, -1)) < 1e-9);
});

test('every zombie kind has a tint', () => {
  for (const k of ['walker', 'runner', 'brute', 'spitter', 'boss'] as const) assert.ok(ZOMBIE_TINT[k]);
});

test('blood spots are bounded when a horde dies at once (regression: unbounded array)', () => {
  const p = JSON.parse(JSON.stringify(DEFAULT_PROGRESS));
  const w = createWorld(1200, 1200, p);
  w.spawnTimer = 1e9; w.hp = w.maxHp = 1e9;
  w.carVy = -300; w.forwardV = 300;
  const idle: UpdateInput = { steerLeft: false, steerRight: false, gear: 'forward', turbo: false, fire: false, triggerAbility: false };
  for (let i = 0; i < 400; i++) {
    for (let j = 0; j < 5; j++) w.zombies.push({ id: w.nextEntityId++, x: w.carX + (j - 2) * 6, y: w.carY - 25, vx: 0, vy: 0, hp: 1, maxHp: 1, kind: 'boss', size: 14, attackCooldown: 0 });
    step(w, 1 / 60, idle, p);
  }
  assert.ok(w.kills > 100, `kills ${w.kills}`);
  assert.ok(w.bloodSpots.length <= MAX_BLOOD_SPOTS);
});

test('committed zombie bake is up to date with the source GLBs and palettes (re-run tools/bake-characters.ts if this fails)', async () => {
  const fresh = await bakeCharacters(root);
  const committed = JSON.parse(fs.readFileSync(path.join(root, BAKED_PATH), 'utf8'));
  assert.deepEqual(committed, fresh);
});

test('runtime zombie models: 18 variants, shared positions, valid linear colours, standing on the ground', () => {
  const models = buildZombieModels();
  assert.equal(models.length, CHARACTER_IDS.length);
  const pos0 = models[0].geometry.getAttribute('position').array;
  for (const m of models) {
    assert.equal(m.geometry.getAttribute('position').array, pos0, 'positions are shared, not copied');
    const col = m.geometry.getAttribute('color').array as Float32Array;
    assert.equal(col.length, pos0.length);
    for (const v of col) assert.ok(v >= 0 && v <= 1);
    assert.ok(m.triangles > 20 && Number.isFinite(m.minY));
  }
  // variants must actually differ visually
  const sums = models.map((m) => (m.geometry.getAttribute('color').array as Float32Array).reduce((a, b) => a + b, 0));
  assert.ok(new Set(sums.map((v) => v.toFixed(3))).size > 6, 'palettes should give distinct looks');
  assert.throws(() => buildZombieModels({ ...JSON.parse(fs.readFileSync(path.join(root, BAKED_PATH), 'utf8')), version: 2 } as any), /unsupported/);
});

test('zombie models are no longer bundled or parsed at runtime', () => {
  const horde = fs.readFileSync(path.join(root, 'src/components/ZombieHorde.tsx'), 'utf8');
  assert.doesNotMatch(horde, /loadCharacter|GLTFLoader|paletteSampler/);
  assert.ok(!fs.existsSync(path.join(root, 'src/render/loadCharacter.ts')));
  assert.ok(!fs.readFileSync(path.join(root, 'src/assets/characters.ts'), 'utf8').includes('require('));
});
