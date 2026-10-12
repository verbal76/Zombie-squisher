import { test } from 'node:test';
import assert from 'node:assert/strict';
import { BACKUP_KEY, CORRUPT_KEY, PROGRESS_KEY, createProgressStore, KeyValueStorage } from '../src/store/progressStore';
import { DEFAULT_PROGRESS } from '../src/store/progressLogic';

function mem(initial: Record<string, string> = {}, opts: { failRead?: boolean; failWrite?: boolean } = {}) {
  const m = new Map(Object.entries(initial));
  const s: KeyValueStorage & { m: Map<string, string> } = {
    m,
    getItem: async (k) => { if (opts.failRead) throw new Error('read'); return m.get(k) ?? null; },
    setItem: async (k, v) => { if (opts.failWrite) throw new Error('write'); m.set(k, v); },
  };
  return s;
}
const prog = (kills: number) => ({ ...JSON.parse(JSON.stringify(DEFAULT_PROGRESS)), totalKills: kills, lifetimeKills: kills, bestRunKills: kills });

test('save: existing saves load exactly as before (same key, same JSON)', async () => {
  const s = mem({ [PROGRESS_KEY]: JSON.stringify(prog(1234)) });
  const p = await createProgressStore(s).load();
  assert.equal(p.totalKills, 1234);
});

test('new install: defaults, nothing written until the first save', async () => {
  const s = mem(); const p = await createProgressStore(s).load();
  assert.deepEqual(p, DEFAULT_PROGRESS); assert.equal(s.m.size, 0);
});

test('save writes the primary key and keeps the previous good value as a backup', async () => {
  const s = mem(); const st = createProgressStore(s);
  await st.save(prog(10)); assert.equal(s.m.get(BACKUP_KEY), undefined, 'nothing to back up on the first save');
  await st.save(prog(20));
  assert.equal(JSON.parse(s.m.get(PROGRESS_KEY)!).totalKills, 20);
  assert.equal(JSON.parse(s.m.get(BACKUP_KEY)!).totalKills, 10);
});

test('corrupted live save: recovered from the backup, damaged value preserved for diagnosis, not silently wiped', async () => {
  const s = mem({ [PROGRESS_KEY]: '{oops', [BACKUP_KEY]: JSON.stringify(prog(777)) });
  const p = await createProgressStore(s).load();
  assert.equal(p.totalKills, 777);
  assert.equal(s.m.get(CORRUPT_KEY), '{oops');
});

test('corrupted live save with no backup: defaults, but the damaged value is kept', async () => {
  const s = mem({ [PROGRESS_KEY]: 'not json' });
  const p = await createProgressStore(s).load();
  assert.deepEqual(p, DEFAULT_PROGRESS); assert.equal(s.m.get(CORRUPT_KEY), 'not json');
});

test('a damaged value is never copied over the good backup', async () => {
  const s = mem({ [PROGRESS_KEY]: '{bad', [BACKUP_KEY]: JSON.stringify(prog(5)) });
  await createProgressStore(s).save(prog(6));
  assert.equal(JSON.parse(s.m.get(BACKUP_KEY)!).totalKills, 5, 'backup untouched');
  assert.equal(JSON.parse(s.m.get(PROGRESS_KEY)!).totalKills, 6);
});

test('storage failures never throw into the game', async () => {
  assert.deepEqual(await createProgressStore(mem({}, { failRead: true })).load(), DEFAULT_PROGRESS);
  await createProgressStore(mem({}, { failWrite: true })).save(prog(1));
});

test('non-object JSON (e.g. "null", "42") counts as damaged', async () => {
  for (const raw of ['null', '42', '"x"']) {
    const s = mem({ [PROGRESS_KEY]: raw, [BACKUP_KEY]: JSON.stringify(prog(9)) });
    assert.equal((await createProgressStore(s).load()).totalKills, 9, raw);
  }
});
