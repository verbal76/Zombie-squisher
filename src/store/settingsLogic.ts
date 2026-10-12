// Player settings (pure, unit tested). Persistence wrapper: settings.ts.
export interface Settings {
  sfx: boolean;
  music: boolean;
}

export const DEFAULT_SETTINGS: Settings = { sfx: true, music: true };

/** Accepts anything that was persisted (older versions, partial or corrupt) and returns valid settings. */
export function sanitizeSettings(raw: unknown): Settings {
  if (raw === null || typeof raw !== 'object' || Array.isArray(raw)) return { ...DEFAULT_SETTINGS };
  const r = raw as Record<string, unknown>;
  return {
    sfx: typeof r.sfx === 'boolean' ? r.sfx : DEFAULT_SETTINGS.sfx,
    music: typeof r.music === 'boolean' ? r.music : DEFAULT_SETTINGS.music,
  };
}
