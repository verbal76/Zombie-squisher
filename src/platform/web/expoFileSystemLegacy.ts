// Web (desktop shell) replacement for the two calls the shared render code makes on expo-file-system/legacy.
// Metro swaps it in for the web platform only (metro.config.js); Android keeps the real module untouched.
export const EncodingType = { UTF8: 'utf8', Base64: 'base64' } as const;

export async function readAsStringAsync(uri: string, options?: { encoding?: string }): Promise<string> {
  const res = await fetch(uri);
  if (!res.ok) throw new Error(`readAsStringAsync ${uri}: HTTP ${res.status}`);
  if (options?.encoding === EncodingType.Base64) return bytesToBase64(new Uint8Array(await res.arrayBuffer()));
  return res.text();
}

export function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) bin += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  return btoa(bin);
}
