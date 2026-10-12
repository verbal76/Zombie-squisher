// Desktop shell glue (Windows / Linux / Steam Deck, running inside Electron; also works in a plain browser).
// Keyboard + gamepad drive the game's existing controls through the shared ControlBus, and drive menu focus by
// spatial navigation over the real DOM, so no shared UI had to change. All rules live in inputMapping.ts (unit tested).
import { useEffect, useRef } from 'react';
import type { ControlBus } from '../game/controlBus';
import {
  GamepadMapper, KeyboardMapper, KEY_PROMPTS, MenuEvent, NO_INTENT, GameIntent, PROMPTS, PadSnapshot, PromptMode, PromptSelector, nextPromptMode, parsePromptMode,
  keyToMenuEvent, mergeIntents, pickNextFocus, GLYPH_IDS,
} from './inputMapping';
import { glyphUri } from './glyphs.web';
import type { DesktopGameInput } from './desktop';

export type { DesktopGameInput };

interface Bridge { platform?: string; onSuspend?(cb: () => void): void; onResume?(cb: () => void): void; }
const bridge = (): Bridge | undefined => (typeof window !== 'undefined' ? (window as any).hagDesktop : undefined);

let installed = false;
let game: DesktopGameInput | null = null;
const pad = new GamepadMapper();
const kb = new KeyboardMapper();
const menuQueue: MenuEvent[] = [];
const prompts = new PromptSelector();
let promptMode: PromptMode = 'auto';
let toastUntil = 0;
let exitEl: HTMLButtonElement | null = null;
const PROMPT_KEY = 'hag:prompt-mode';       // per device, never part of the cloud-synced save
let padIndex: number | null = null;
let hintEl: HTMLDivElement | null = null;
let lastFocusScan = 0;
const emitted = { steerLeft: false, steerRight: false, turbo: false, reverse: false };

// ---- bus output ---------------------------------------------------------------------------------------------------
function applyIntent(bus: ControlBus, i: GameIntent): void {
  if (emitted.steerLeft !== i.steerLeft) { emitted.steerLeft = i.steerLeft; bus.hold('steerLeft', i.steerLeft); }
  if (emitted.steerRight !== i.steerRight) { emitted.steerRight = i.steerRight; bus.hold('steerRight', i.steerRight); }
  if (emitted.turbo !== i.turbo) { emitted.turbo = i.turbo; bus.hold('turbo', i.turbo); }
  if (emitted.reverse !== i.reverse) { emitted.reverse = i.reverse; bus.tap(i.reverse ? 'gearReverse' : 'gearForward'); }
}
const releaseAll = (bus: ControlBus) => applyIntent(bus, NO_INTENT);

// ---- menu navigation ----------------------------------------------------------------------------------------------
const SELECTOR = '[tabindex]:not([tabindex="-1"]), button, a[href], [role="button"]';

function visibleFocusables(): HTMLElement[] {
  const out: HTMLElement[] = [];
  document.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => {
    if (el.closest('[aria-hidden="true"]') || el.hasAttribute('data-hag-ignore')) return;
    const r = el.getBoundingClientRect();
    if (r.width < 4 || r.height < 4 || r.right < 0 || r.bottom < 0 || r.left > innerWidth || r.top > innerHeight) return;
    const top = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    if (top && (top === el || el.contains(top) || top.contains(el))) out.push(el);       // not covered by an overlay
  });
  return out;
}
const labelOf = (el: HTMLElement) => (el.getAttribute('aria-label') || el.textContent || '').trim();
const PREFERRED = /^(drive|resume|play again|retry|continue|close|ok)\b/i;

function ensureFocus(list: HTMLElement[]): void {
  const cur = document.activeElement as HTMLElement | null;
  if (cur && list.includes(cur)) return;
  const pick = list.find((el) => PREFERRED.test(labelOf(el))) ?? list[0];
  pick?.focus({ preventScroll: true });
}

function click(el: HTMLElement): void {
  el.click();       // React Native Web's Pressable activates on a real click (a synthetic Enter keydown is ignored)
}

function cyclePromptMode(): void {
  promptMode = nextPromptMode(promptMode);
  try { localStorage.setItem(PROMPT_KEY, promptMode); } catch { /* storage unavailable: keep in memory */ }
  toastUntil = performance.now() + 1800;
}

function handleMenuEvent(ev: MenuEvent): void {
  if (ev === 'prompts') { cyclePromptMode(); return; }
  const list = visibleFocusables();
  if (list.length === 0) return;
  const cur = list.indexOf(document.activeElement as HTMLElement);
  if (ev === 'up' || ev === 'down' || ev === 'left' || ev === 'right') {
    if (cur < 0) { ensureFocus(list); return; }
    const next = pickNextFocus(list.map((el) => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; }), cur, ev);
    list[next]?.focus({ preventScroll: true });
  } else if (ev === 'confirm') {
    click(cur >= 0 ? list[cur] : (ensureFocus(list), list.find((el) => el === document.activeElement) ?? list[0]));
  } else if (ev === 'cancel' || ev === 'start') {
    const re = ev === 'start' ? /^(resume)$/i : /^(close|back|cancel|resume)$/i;
    const target = list.find((el) => re.test(labelOf(el)));
    if (target) click(target);
  }
}

// ---- gamepad ------------------------------------------------------------------------------------------------------
function readPad(): PadSnapshot | null {
  const pads = (navigator.getGamepads ? Array.from(navigator.getGamepads()) : []).filter((p): p is Gamepad => !!p && p.connected);
  if (pads.length === 0) return null;
  const p = (padIndex !== null ? pads.find((x) => x.index === padIndex) : undefined) ?? pads.find((x) => x.mapping === 'standard') ?? pads[0];
  padIndex = p.index;
  return { buttons: p.buttons.map((b) => b.value), axes: Array.from(p.axes) };
}

// ---- hints (controller prompts) -----------------------------------------------------------------------------------
function setHint(playing: boolean, now: number): void {
  if (!hintEl) return;
  const source = prompts.current(promptMode);
  if (now < toastUntil) {
    const key = `toast:${promptMode}`;
    if (hintEl.dataset.key !== key) { hintEl.dataset.key = key; hintEl.innerHTML = `<span class="v">Prompt style: ${promptMode === 'auto' ? 'Automatic' : promptMode === 'gamepad' ? 'Gamepad' : 'Keyboard'}</span>`; }
    return;
  }
  const set = source === 'pad' ? (playing ? PROMPTS.play : PROMPTS.menu) : (playing ? KEY_PROMPTS.play : KEY_PROMPTS.menu);
  const key = `${source}:${playing}`;
  if (hintEl.dataset.key === key) return;
  hintEl.dataset.key = key;
  hintEl.innerHTML = set.map(([k, v]) => {
    const imgs = (GLYPH_IDS[k] ?? []).map(glyphUri).filter((u): u is string => !!u);
    const keys = imgs.length ? imgs.map((u) => `<img src="${u}" alt="${k}">`).join('') : `<span class="k">${k}</span>`;
    return `${keys}<span class="v">${v}</span>`;
  }).join('');
}

function installStyle(): void {
  const style = document.createElement('style');
  style.textContent = `
    [data-hag-focus]{outline:3px solid #ffc400 !important;outline-offset:3px !important;box-shadow:0 0 16px 2px rgba(255,196,0,.65) !important}
    #hag-hint{position:fixed;left:50%;bottom:10px;transform:translateX(-50%);display:flex;gap:10px;align-items:center;
      padding:6px 14px;background:rgba(10,8,5,.72);border:1px solid rgba(255,255,255,.18);border-radius:8px;
      font:600 14px/1 system-ui,sans-serif;color:#ddd;pointer-events:none;z-index:2147483000;white-space:nowrap}
    #hag-exit{position:fixed;left:16px;bottom:16px;min-width:140px;height:48px;padding:0 18px;background:#1c1510;color:#ffc400;border:2px solid #ffc400;
      border-radius:10px;font:800 15px/1 system-ui,sans-serif;letter-spacing:1px;cursor:pointer;z-index:2147482000}
    #hag-hint img{height:30px;width:auto;vertical-align:middle;margin-right:-4px}
    #hag-hint .k{background:#ffc400;color:#111;border-radius:5px;padding:3px 7px;font-weight:800}
    #hag-hint .v{margin-right:8px}
    html,body{background:#0d0805;overscroll-behavior:none;-webkit-user-select:none;user-select:none;cursor:default}`;
  document.head.appendChild(style);
  hintEl = document.createElement('div'); hintEl.id = 'hag-hint'; hintEl.setAttribute('data-hag-ignore', '1');
  document.body.appendChild(hintEl);
  try { promptMode = parsePromptMode(localStorage.getItem(PROMPT_KEY)); } catch { promptMode = 'auto'; }
  exitEl = document.createElement('button');
  exitEl.id = 'hag-exit'; exitEl.textContent = 'EXIT GAME'; exitEl.setAttribute('aria-label', 'EXIT GAME'); exitEl.setAttribute('tabindex', '0');
  exitEl.style.display = 'none';
  exitEl.addEventListener('click', () => { const b = bridge() as any; if (b?.quit) b.quit(); else window.close(); });
  document.body.appendChild(exitEl);
  document.addEventListener('focusin', (e) => { (e.target as HTMLElement)?.setAttribute?.('data-hag-focus', '1'); });
  document.addEventListener('focusout', (e) => { (e.target as HTMLElement)?.removeAttribute?.('data-hag-focus'); });
}

// ---- main loop ----------------------------------------------------------------------------------------------------
function frame(now: number): void {
  requestAnimationFrame(frame);
  const playing = !!game && game.active;
  const snap = readPad();
  const res = pad.poll(snap, playing, now);
  if (snap && (res.menu.length || res.intent.ability || res.intent.pause || res.intent.steerLeft || res.intent.steerRight || res.intent.turbo)) prompts.note('pad', now);

  if (playing && game) {
    const k = kb.intent();
    const intent = mergeIntents(k, res.intent);
    applyIntent(game.bus, intent);
    if (intent.gunsToggle) game.bus.tap('gunsToggle');
    if (intent.ability) game.onAbility();
    if (intent.pause) game.onPause();
  } else {
    if (game) releaseAll(game.bus);
    kb.releaseAll();
    const events = menuQueue.splice(0).concat(res.menu);
    for (const ev of events) {
      if (ev === 'start' && game && game.paused) { game.onResume(); continue; }
      handleMenuEvent(ev);
    }
    if (now - lastFocusScan > 250) {            // never lose focus: re-acquire after a screen change
      lastFocusScan = now;
      const list = visibleFocusables();
      // EXIT GAME exists only on the main menu (controller-reachable: Steam requires a way to quit without a keyboard).
      const onMainMenu = list.some((el) => el !== exitEl && /^drive\b/i.test(labelOf(el)));
      if (exitEl) exitEl.style.display = onMainMenu && (bridge() !== undefined) ? 'block' : 'none';
      if (list.length) ensureFocus(list);
    }
  }
  setHint(playing, now);
}

function systemPause(): void {
  kb.releaseAll();
  if (game && game.active) game.onPause();
}

export function installDesktopShell(): void {
  if (installed || typeof window === 'undefined' || typeof document === 'undefined') return;
  installed = true;
  installStyle();
  // Pausing while the browser is still starting a sound rejects play() with an AbortError. It is a harmless, well-known race (the sound is
  // simply not played); keep it out of the console so real errors stay visible.
  window.addEventListener('unhandledrejection', (e) => {
    const r = e.reason as { name?: string; message?: string } | undefined;
    if (r?.name === 'AbortError' && /play\(\) request was interrupted/.test(r.message ?? '')) e.preventDefault();
  });
  window.addEventListener('keydown', (e) => {
    if (e.ctrlKey || e.metaKey || (e.altKey && e.key === 'Enter')) return;       // leave browser/Electron shortcuts alone
    if (!(e.code === 'F2')) prompts.note('kb', performance.now());
    if (game && game.active) { if (kb.keyDown(e.code, e.repeat)) e.preventDefault(); return; }
    const ev = keyToMenuEvent(e.code);
    if (ev) { e.preventDefault(); if (!e.repeat || ev === 'up' || ev === 'down' || ev === 'left' || ev === 'right') menuQueue.push(ev); }
  }, true);
  window.addEventListener('keyup', (e) => kb.keyUp(e.code), true);
  window.addEventListener('blur', systemPause);
  document.addEventListener('visibilitychange', () => { if (document.hidden) systemPause(); });
  window.addEventListener('gamepadconnected', (e) => { prompts.note('pad', performance.now()); if (padIndex === null) padIndex = (e as GamepadEvent).gamepad.index; });
  window.addEventListener('gamepaddisconnected', (e) => {
    if (padIndex === (e as GamepadEvent).gamepad.index) { padIndex = null; pad.reset(); systemPause(); }     // controller lost: pause, never run on blind
  });
  bridge()?.onSuspend?.(systemPause);
  bridge()?.onResume?.(() => { kb.releaseAll(); pad.reset(); });
  requestAnimationFrame(frame);
}

export function useDesktopGameInput(input: DesktopGameInput): void {
  const ref = useRef(input);
  ref.current = input;
  useEffect(() => {
    installDesktopShell();
    const proxy: DesktopGameInput = {
      get bus() { return ref.current.bus; }, get active() { return ref.current.active; }, get paused() { return ref.current.paused; },
      onAbility: () => ref.current.onAbility(), onPause: () => ref.current.onPause(), onResume: () => ref.current.onResume(),
    };
    game = proxy;
    return () => { releaseAll(proxy.bus); if (game === proxy) game = null; };
  }, []);
}
