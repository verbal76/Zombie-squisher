// Runtime diagnostics surface. Captures the four signals we need to debug
// render failures end-to-end:
//
//   modelsAttempted / modelsLoaded  — was the parsing layer fine?
//   drawBufW / drawBufH             — was the GLView layer fine?
//   frames                          — is the render loop actually ticking?
//   lastRenderError                 — what crashed in three.js, if anything?
//
// Errors thrown deep in three.js (e.g. texture upload via getDimensions on
// an undefined image) don't pass through React, so a React error boundary
// can't see them. We catch them via ErrorUtils.setGlobalHandler — the RN
// runtime's top-level uncaught-error hook — and stash the message here for
// the About modal to display.

let modelsAttempted = 0;
let modelsLoaded = 0;
let frames = 0;
let drawBufW = 0;
let drawBufH = 0;
let sceneObjects = 0;
let lastRenderError: string | null = null;

const listeners = new Set<() => void>();

function notify(): void {
  listeners.forEach((fn) => {
    try { fn(); } catch {}
  });
}

export interface DiagSnapshot {
  modelsAttempted: number;
  modelsLoaded: number;
  frames: number;
  drawBufW: number;
  drawBufH: number;
  sceneObjects: number;
  lastRenderError: string | null;
}

export const Diag = {
  attemptModel(): void { modelsAttempted++; notify(); },
  loadModel(): void { modelsLoaded++; notify(); },
  // Frames bump every render tick — too noisy to notify every frame, so
  // we batch updates every 30 frames (~0.5s at 60fps).
  frame(): void { frames++; if (frames % 30 === 0) notify(); },
  resetFrames(): void { frames = 0; notify(); },
  setDrawBuf(w: number, h: number): void {
    if (w === drawBufW && h === drawBufH) return;
    drawBufW = w; drawBufH = h; notify();
  },
  setScene(n: number): void {
    if (n === sceneObjects) return;
    sceneObjects = n; notify();
  },
  setRenderError(err: unknown): void {
    const msg = (err as Error)?.message ?? String(err);
    if (msg === lastRenderError) return;
    lastRenderError = msg; notify();
  },
  clearRenderError(): void {
    if (lastRenderError === null) return;
    lastRenderError = null; notify();
  },
  snapshot(): DiagSnapshot {
    return { modelsAttempted, modelsLoaded, frames, drawBufW, drawBufH, sceneObjects, lastRenderError };
  },
  subscribe(fn: () => void): () => void {
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  },
};

// Install the global uncaught-error hook. Idempotent — safe to call from
// any module's top level or App.tsx's mount effect.
let installed = false;
export function installGlobalErrorHandler(): void {
  if (installed) return;
  installed = true;
  const ErrorUtils = (global as any).ErrorUtils;
  if (!ErrorUtils?.setGlobalHandler) return;
  const orig: ((err: Error, isFatal?: boolean) => void) | undefined =
    ErrorUtils.getGlobalHandler?.();
  ErrorUtils.setGlobalHandler((err: Error, isFatal?: boolean) => {
    Diag.setRenderError(err);
    if (orig) {
      try { orig(err, isFatal); } catch {}
    }
  });
}
