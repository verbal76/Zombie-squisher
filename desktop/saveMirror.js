// Progress mirror: a plain, atomically replaced JSON copy of the game's progress (Steam Cloud / backup friendly).
// Pure Node (no Electron) so it is unit tested, including interrupted writes. See desktop/main.js and preload.js.
'use strict';
const fs = require('node:fs');
const path = require('node:path');

const KEY_RE = /^zs:progress:/;
const MAX_VALUE = 1_000_000;
const validSave = (o) => !!o && typeof o === 'object' && o.schema === 1 && !!o.keys && typeof o.keys === 'object';

function createSaveMirror(dir) {
  const file = path.join(dir, 'progress.json');
  const bak = `${file}.bak`;
  const tmp = `${file}.tmp`;

  const parse = (f) => { try { const o = JSON.parse(fs.readFileSync(f, 'utf8')); return validSave(o) ? o : null; } catch { return null; } };

  /** The newest valid copy: progress.json, else the backup; null when neither is usable (a stray .tmp is never trusted). */
  function read() { return parse(file) ?? parse(bak); }

  /** Mirror one progress key. Returns true when written. A damaged value, a foreign key or an oversized value is refused. */
  function write(key, value) {
    if (typeof key !== 'string' || !KEY_RE.test(key) || typeof value !== 'string' || value.length > MAX_VALUE) return false;
    try { JSON.parse(value); } catch { return false; }          // never mirror a corrupt value over a good one
    const cur = read() ?? { schema: 1, keys: {} };
    cur.keys[key] = value; cur.savedAt = new Date().toISOString();
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(tmp, JSON.stringify(cur));                  // 1. complete new copy beside the old one
    if (parse(file)) { try { fs.copyFileSync(file, bak); } catch { /* keep going: the new copy still replaces the live one */ } }   // 2. only a VALID live copy becomes the backup
    fs.renameSync(tmp, file);                                    // 3. atomic replace
    return true;
  }
  return { read, write, file, bak, tmp };
}
module.exports = { createSaveMirror, validSave };
