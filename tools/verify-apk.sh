#!/usr/bin/env bash
# Verifies a built APK before it is handed to anyone.
#   - identity: package / versionCode / versionName
#   - target SDK >= 35 (Play baseline), minSdk reported
#   - signing: v2+ signature verifies; signer matches the key of previously shipped builds
#   - 16 KB page-size compatibility: zip alignment + ELF LOAD segment alignment (arm64-v8a, x86_64)
#   - unwanted permissions absent
# Usage: tools/verify-apk.sh <apk> <package> <versionCode> <versionName> [expected-signer-sha256]
set -euo pipefail
APK="$1"; PKG="$2"; VCODE="$3"; VNAME="$4"; SIGNER="${5:-}"
BT="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"
fail() { echo "FAIL: $*"; exit 1; }

BADGING="$("$BT/aapt2" dump badging "$APK")"
echo "$BADGING" | grep -E "^package:|^sdkVersion|^targetSdkVersion|^application-label:|^launchable-activity" || true
echo "$BADGING" | grep -q "package: name='$PKG' versionCode='$VCODE' versionName='$VNAME'" || fail "identity mismatch (want $PKG $VCODE $VNAME)"
TSDK="$(echo "$BADGING" | sed -n "s/^targetSdkVersion:'\([0-9]*\)'.*/\1/p")"
[ "${TSDK:-0}" -ge 35 ] || fail "targetSdk ${TSDK:-?} < 35"
for perm in SYSTEM_ALERT_WINDOW READ_EXTERNAL_STORAGE WRITE_EXTERNAL_STORAGE RECORD_AUDIO MODIFY_AUDIO_SETTINGS FOREGROUND_SERVICE FOREGROUND_SERVICE_MEDIA_PLAYBACK; do
  echo "$BADGING" | grep -q "uses-permission: name='android.permission.$perm'" && fail "unexpected permission $perm"
done
echo "identity/target SDK/permissions: OK (targetSdk $TSDK)"

CERTS="$("$BT/apksigner" verify --verbose --print-certs "$APK")"
echo "$CERTS" | grep -E "Verifies|Verified using|certificate SHA-256" || true
echo "$CERTS" | grep -q "Verified using v2 scheme (APK Signature Scheme v2): true\|Verified using v3 scheme (APK Signature Scheme v3): true" || fail "no v2/v3 signature"
ACTUAL="$(echo "$CERTS" | sed -n 's/.*certificate SHA-256 digest: \([0-9a-fA-F]*\).*/\1/p' | head -1 | tr 'a-f' 'A-F')"
if [ -n "$SIGNER" ]; then
  [ "$ACTUAL" = "$(echo "$SIGNER" | tr 'a-f' 'A-F')" ] || fail "signer $ACTUAL != expected $SIGNER (APK could not update the installed app in place)"
  echo "signer matches shipped builds: OK ($ACTUAL)"
fi

"$BT/zipalign" -c -P 16 -v 4 "$APK" > /tmp/zipalign.log 2>&1 && echo "zipalign -P 16: OK" || { tail -20 /tmp/zipalign.log; fail "zip not 16 KB aligned"; }
TMP="$(mktemp -d)"; unzip -q "$APK" 'lib/*' -d "$TMP"
bad=0; n=0
while IFS= read -r so; do
  n=$((n+1))
  while read -r align; do
    [ $((align)) -ge $((0x4000)) ] || { echo "FAIL: $(basename "$so") [$(basename "$(dirname "$so")")] LOAD align $align"; bad=1; }
  done < <(readelf -lW "$so" | awk '$1=="LOAD"{print $NF}')
done < <(find "$TMP/lib/arm64-v8a" "$TMP/lib/x86_64" -name '*.so' 2>/dev/null)
[ "$n" -gt 0 ] || fail "no native libs found"
[ "$bad" -eq 0 ] || exit 1
echo "ELF LOAD alignment >= 16 KB: OK ($n libs checked)"
echo "APK_VERIFY_OK"
