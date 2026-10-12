import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
const { createSaveMirror } = require('../desktop/saveMirror.js');

const KEY = 'zs:progress:v2';
const val = (n: number) => JSON.stringify({ totalKills: n });
const fresh = () => { const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mirror-')); return { dir, m: createSaveMirror(dir) }; };

test('mirror: normal write and read; the previous good copy becomes the backup', () => {
  const { m } = fresh();
  assert.equal(m.read(), null, 'nothing yet');
  assert.equal(m.write(KEY, val(1)), true);
  assert.equal(JSON.parse(m.read().keys[KEY]).totalKills, 1);
  assert.equal(fs.existsSync(m.bak), false, 'no backup until there is something to back up');
  m.write(KEY, val(2));
  assert.equal(JSON.parse(m.read().keys[KEY]).totalKills, 2);
  assert.equal(JSON.parse(JSON.parse(fs.readFileSync(m.bak, 'utf8')).keys[KEY]).totalKills, 1);
  assert.equal(fs.existsSync(m.tmp), false, 'no temp file left behind');
});

test('mirror: a truncated or corrupt live file falls back to the backup (interrupted write on disk)', () => {
  const { m } = fresh();
  m.write(KEY, val(10)); m.write(KEY, val(20));
  fs.writeFileSync(m.file, fs.readFileSync(m.file, 'utf8').slice(0, 15));       // power cut mid-write left a stump
  assert.equal(JSON.parse(m.read().keys[KEY]).totalKills, 10, 'recovered from the backup');
  fs.writeFileSync(m.file, '');                                                   // zero-byte file
  assert.equal(JSON.parse(m.read().keys[KEY]).totalKills, 10);
});

test('mirror: crash after the temp file was written but before the rename leaves the live copy intact and ignores the temp file', () => {
  const { m } = fresh();
  m.write(KEY, val(5));
  fs.writeFileSync(m.tmp, JSON.stringify({ schema: 1, keys: { [KEY]: val(999) } }));   // simulated: new copy written, process killed before rename
  assert.equal(JSON.parse(m.read().keys[KEY]).totalKills, 5, 'the temp file is never trusted');
  m.write(KEY, val(6));                                                           // the next write overwrites the stale temp and succeeds
  assert.equal(JSON.parse(m.read().keys[KEY]).totalKills, 6);
  assert.equal(fs.existsSync(m.tmp), false);
});

test('mirror: a damaged live file is NEVER copied over a good backup (regression: it used to be)', () => {
  const { m } = fresh();
  m.write(KEY, val(1)); m.write(KEY, val(2));                                     // live = 2, backup = 1
  fs.writeFileSync(m.file, '{broken');
  m.write(KEY, val(3));                                                           // read() falls back to the backup, then the damaged live file must not become the backup
  assert.equal(JSON.parse(m.read().keys[KEY]).totalKills, 3);
  assert.equal(JSON.parse(JSON.parse(fs.readFileSync(m.bak, 'utf8')).keys[KEY]).totalKills, 1, 'the backup is still the last good copy');
});

test('mirror: refuses corrupt values, foreign keys, oversized values and wrong schema', () => {
  const { m } = fresh();
  m.write(KEY, val(7));
  assert.equal(m.write(KEY, '{corrupt'), false);
  assert.equal(m.write('zs:settings:v1', val(1)), false, 'settings are never mirrored');
  assert.equal(m.write(KEY, 'x'.repeat(1_000_001)), false);
  assert.equal(m.write(42 as any, val(1)), false);
  assert.equal(JSON.parse(m.read().keys[KEY]).totalKills, 7, 'the good value survived every refusal');
  fs.writeFileSync(m.file, JSON.stringify({ schema: 2, keys: {} }));
  fs.rmSync(m.bak, { force: true });
  assert.equal(m.read(), null, 'unknown schema is not trusted');
});

test('mirror: keeps only progress keys and writes plain JSON a person (or Steam Auto-Cloud) can read', () => {
  const { m } = fresh();
  m.write(KEY, val(8));
  const o = JSON.parse(fs.readFileSync(m.file, 'utf8'));
  assert.equal(o.schema, 1); assert.deepEqual(Object.keys(o.keys), [KEY]); assert.ok(Date.parse(o.savedAt) > 0);
});

test('shell wiring: main.js uses the tested module and the packager ships it', () => {
  const main = fs.readFileSync(path.join(__dirname, '../desktop/main.js'), 'utf8');
  assert.match(main, /require\('\.\/saveMirror'\)/);
  assert.match(fs.readFileSync(path.join(__dirname, '../desktop/build.mjs'), 'utf8'), /'saveMirror\.js'/);
});
