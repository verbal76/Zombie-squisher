#!/usr/bin/env bash
# Installs the APK on a running emulator, launches it and drives the real UI.
# Writes screenshots + evidence to ./smoke and exits non-zero on any failed assertion.
# Usage: tools/emulator-smoke.sh <apk> <package>
set -uo pipefail
APK="$1"; PKG="$2"; OUT=smoke
mkdir -p "$OUT"; FAILS=0
fail() { echo "SMOKE FAIL: $*" | tee -a "$OUT/result.txt"; FAILS=$((FAILS+1)); }
ok()   { echo "SMOKE OK:   $*" | tee -a "$OUT/result.txt"; }
shot() { adb exec-out screencap -p > "$OUT/$1.png"; }
dump() { adb shell uiautomator dump /sdcard/ui.xml >/dev/null 2>&1; adb pull /sdcard/ui.xml "$OUT/ui.xml" >/dev/null 2>&1; }
# The software-rendered CI emulator regularly makes *system* apps stall (seen: "Pixel Launcher isn't responding"),
# and that ANR dialog hides the game's window from uiautomator. It says nothing about the game, so dismiss it.
dismiss_system_dialogs() {
  if grep -q "isn't responding" "$OUT/ui.xml" 2>/dev/null; then
    echo "SMOKE NOTE: dismissing a system ANR dialog (emulator launcher stall)" | tee -a "$OUT/result.txt"
    if xy=$(python3 tools/ui.py "$OUT/ui.xml" find "Wait"); then adb shell input tap $xy; sleep 2; return 0; fi
  fi
  return 1
}
tap_label() { # tap by visible text or content-desc; retries while the UI settles
  for _ in 1 2 3 4 5 6 7 8; do
    dump
    if dismiss_system_dialogs; then continue; fi
    if xy=$(python3 tools/ui.py "$OUT/ui.xml" find "$1"); then adb shell input tap $xy; return 0; fi
    sleep 2
  done
  return 1
}

adb wait-for-device
adb shell getprop ro.build.version.sdk | tee "$OUT/device-sdk.txt"
adb shell settings put global hide_error_dialogs 1 || true       # keep system ANR/crash dialogs off the screen (crashes are still caught via logcat)
adb install -r "$APK" > "$OUT/install.txt" 2>&1 && ok "installed $(basename "$APK")" || { cat "$OUT/install.txt"; fail "install failed"; exit 1; }
adb shell pm dump "$PKG" | grep -E "versionName|versionCode|targetSdk" | head -4 | tee "$OUT/pm.txt"
adb logcat -c

# ---- cold start: sample frames quickly to catch the HAG splash ----
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1
START=$(date +%s)
for i in $(seq -w 1 14); do shot "launch-$i"; done
sleep 4

# ---- menu ----
tap_label "DRIVE" && ok "menu visible, DRIVE tapped" || { shot menu-missing; fail "DRIVE button never appeared (menu not shown / app stuck)"; }
sleep 6
shot play-01

# ---- background / foreground lifecycle: auto-pause, no crash ----
# Done early, while the run is certainly still alive: the starter car dies to the horde after roughly 35-130 s,
# and a Game Over screen has nothing to pause. (A run that ended anyway is reported, not failed.)
adb shell input keyevent KEYCODE_HOME; sleep 3
adb shell monkey -p "$PKG" -c android.intent.category.LAUNCHER 1 >/dev/null 2>&1; sleep 4; shot resumed
PID2=$(adb shell pidof "$PKG" | tr -d '\r')
[ -n "$PID2" ] && ok "survived background/foreground (pid $PID2)" || fail "app died on background/foreground"
dump
if python3 tools/ui.py "$OUT/ui.xml" find "PAUSED" >/dev/null; then
  ok "auto-paused after backgrounding"
  if tap_label "RESUME"; then
    sleep 2; dump
    python3 tools/ui.py "$OUT/ui.xml" find "PAUSED" >/dev/null && fail "PAUSED overlay did not go away after RESUME" || ok "RESUME dismisses the pause overlay"
  else
    fail "RESUME button not found on the pause overlay"
  fi
elif python3 tools/ui.py "$OUT/ui.xml" find "WIPED OUT" >/dev/null; then
  echo "SMOKE NOTE: run had already ended (Game Over screen); pause check not applicable" | tee -a "$OUT/result.txt"
else
  shot pause-missing; fail "no PAUSED overlay after returning from background"
fi

# ---- pause / About diagnostics (3D models loaded, frames, errors) ----
if tap_label "About"; then
  sleep 2; shot about; dump
  python3 tools/ui.py "$OUT/ui.xml" text > "$OUT/about-text.txt"
  cat "$OUT/about-text.txt" | tr '\n' ' ' | head -c 3000; echo
  FR=$(grep -o 'FRAMES *[0-9]*' "$OUT/about-text.txt" | grep -o '[0-9]*$' | head -1)
  MODELS=$(grep -o '3D MODELS *[0-9]*/[0-9]*' "$OUT/about-text.txt" | head -1)
  if [ -n "${FR:-}" ] && [ "$FR" -gt 60 ]; then ok "render loop ticking (FRAMES=$FR)"; else fail "render loop not ticking (FRAMES=${FR:-none})"; fi
  if echo "${MODELS:-}" | grep -qE '3D MODELS *[1-9][0-9]*/'; then ok "3D models loaded (${MODELS})"; else fail "no 3D models loaded (${MODELS:-none})"; fi
  grep -q 'LOAD ERR *(none)' "$OUT/about-text.txt" && ok "no model load errors" || fail "model load error reported"
  grep -q 'RENDER ERR *(none)' "$OUT/about-text.txt" && ok "no render errors" || fail "render error reported"
else
  fail "could not open About (in-game gear missing)"
fi

# ---- close About (it pauses the game and, by design, hides the pause overlay while open) ----
tap_label "CLOSE" && ok "About closed" || fail "could not close About"
sleep 2
dump; python3 tools/ui.py "$OUT/ui.xml" find "PAUSED" >/dev/null 2>&1 && fail "game still paused after closing About" || ok "game resumed after closing About"

# ---- gameplay: hold RIGHT steer + wait while zombies swarm ----
SIZE=$(adb shell wm size | grep -o '[0-9]*x[0-9]*' | tail -1); W=${SIZE%x*}; H=${SIZE#*x}
DENS=$(adb shell wm density | grep -o '[0-9]*' | tail -1)
# landscape: wm size reports portrait dims on some images; normalise so W>H
if [ "$W" -lt "$H" ]; then T=$W; W=$H; H=$T; fi
RX=$(( W - (16+44)*DENS/160 )); RY=$(( H - (22+44)*DENS/160 ))
adb shell input swipe "$RX" "$RY" "$RX" "$RY" 3000 &
sleep 4; shot play-02; wait
sleep 8; shot play-03
adb shell dumpsys meminfo "$PKG" | grep -E "TOTAL|Graphics|Native Heap" | head -4 | tee "$OUT/meminfo.txt"

# ---- process health ----
PID=$(adb shell pidof "$PKG" | tr -d '\r')
[ -n "$PID" ] && ok "app process alive (pid $PID) after $(( $(date +%s) - START ))s" || fail "app process is not running (crashed?)"
adb logcat -d > "$OUT/logcat-full.txt" 2>&1
adb logcat -d -s ReactNativeJS:V AndroidRuntime:E DEBUG:F libc:F > "$OUT/logcat-app.txt" 2>&1
if grep -q "FATAL EXCEPTION" "$OUT/logcat-full.txt"; then fail "FATAL EXCEPTION in logcat"; grep -A12 "FATAL EXCEPTION" "$OUT/logcat-full.txt" | head -40; else ok "no fatal exceptions"; fi
grep -q "signal 11\|SIGSEGV\|Fatal signal" "$OUT/logcat-full.txt" && fail "native crash signal in logcat" || ok "no native crash"
echo "--- ReactNativeJS errors/warnings:"; grep -E " E ReactNativeJS| W ReactNativeJS" "$OUT/logcat-app.txt" | head -20 || true

echo "SMOKE_FAILS=$FAILS" | tee -a "$OUT/result.txt"
exit $FAILS
