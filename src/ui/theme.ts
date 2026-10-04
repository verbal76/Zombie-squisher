// Scrapyard look (docs/design/master-design.md "UI Direction"): dirty metal framing, hazard-stripe accents,
// bold readable type. One palette so every screen reads as the same game.
import { Platform } from 'react-native';

export const colors = {
  bg: '#0e0c0a',
  panel: 'rgba(24,19,15,0.88)',
  panelSolid: '#1b1612',
  edge: '#4a3b2e',
  hazard: '#ffc400',
  hazardDim: '#8a6a00',
  rust: '#d9531e',
  danger: '#e34a4a',
  ok: '#3acb55',
  cyan: '#22d3ee',
  text: '#f4ebdd',
  dim: '#a0948a',
  faint: '#6b6157',
} as const;

// Heavy condensed Android system faces give the poster-style type without bundling a font.
export const fonts = {
  heavy: Platform.select({ android: 'sans-serif-black', default: undefined }),
  condensed: Platform.select({ android: 'sans-serif-condensed', default: undefined }),
  mono: Platform.select({ android: 'monospace', default: 'Courier' }),
};

export const type = {
  title: { fontFamily: fonts.heavy, fontWeight: '900' as const, letterSpacing: 3 },
  label: { fontFamily: fonts.condensed, fontWeight: '700' as const, letterSpacing: 1.5 },
  number: { fontFamily: fonts.heavy, fontWeight: '900' as const },
};
