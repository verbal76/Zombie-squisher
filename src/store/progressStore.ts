// Progress persistence with corruption protection. Pure (storage is injected) so every failure mode is unit tested.
// Layout (the primary key and its value format are unchanged, so existing saves load exactly as before):
//   zs:progress:v2          the live save (JSON, versioned by the key)
//   zs:progress:v2:bak      the last good copy, refreshed before each overwrite
//   zs:progress:v2:corrupt  a damaged live value kept for diagnosis instead of being silently overwritten
import { Progress } from '../types';
import { DEFAULT_PROGRESS, sanitizeProgress } from './progressLogic';

export interface KeyValueStorage {
  getItem(key: string): Promise<string | null>;
  setItem(key: string, value: string): Promise<void>;
}

export const PROGRESS_KEY = 'zs:progress:v2';
export const BACKUP_KEY = `${PROGRESS_KEY}:bak`;
export const CORRUPT_KEY = `${PROGRESS_KEY}:corrupt`;

const fresh = (): Progress => JSON.parse(JSON.stringify(DEFAULT_PROGRESS));

function parse(raw: string | null): Progress | null {
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    return v && typeof v === 'object' ? sanitizeProgress(v) : null;
  } catch { return null; }
}

export function createProgressStore(storage: KeyValueStorage) {
  return {
    async load(): Promise<Progress> {
      let raw: string | null = null;
      try { raw = await storage.getItem(PROGRESS_KEY); } catch { /* unreadable storage: fall through to defaults */ }
      if (raw === null) return fresh();                       // genuinely new install
      const live = parse(raw);
      if (live) return live;
      // The live value is damaged: keep it for diagnosis, recover from the last good copy if there is one.
      try { await storage.setItem(CORRUPT_KEY, raw); } catch {}
      let bak: string | null = null;
      try { bak = await storage.getItem(BACKUP_KEY); } catch {}
      return parse(bak) ?? fresh();
    },
    async save(p: Progress): Promise<void> {
      try {
        const prev = await storage.getItem(PROGRESS_KEY);
        if (prev && parse(prev)) await storage.setItem(BACKUP_KEY, prev);   // never back up a damaged value over a good one
      } catch {}
      try { await storage.setItem(PROGRESS_KEY, JSON.stringify(p)); } catch {}
    },
  };
}
