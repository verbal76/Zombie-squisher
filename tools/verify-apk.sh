#!/usr/bin/env bash
# Verifies a built APK: identity, target SDK, 16 KB page-size compatibility.
# Usage: tools/verify-apk.sh <apk> <expected-package> <expected-versionCode> <expected-versionName>
set -euo pipefail
APK="$1"; PKG="$2"; VCODE="$3"; VNAME="$4"
BT="$ANDROID_HOME/build-tools/$(ls "$ANDROID_HOME/build-tools" | sort -V | tail -1)"

BADGING="$("$BT/aapt2" dump badging "$APK")"
echo "$BADGING" | grep -E "^package:|^sdkVersion|^targetSdkVersion|^application-label:|native-code"
echo "$BADGING" | grep -q "package: name='$PKG' versionCode='$VCODE' versionName='$VNAME'" || { echo "FAIL: identity mismatch"; exit 1; }
TSDK="$(echo "$BADGING" | sed -n "s/^targetSdkVersion:'\([0-9]*\)'.*/\1/p")"
[ "$TSDK" -ge 35 ] || { echo "FAIL: targetSdk $TSDK < 35"; exit 1; }

# 16 KB: zip entries for .so must be 16 KB-aligned (stored uncompressed) and ELF segments aligned >= 0x4000.
"$BT/zipalign" -c -P 16 -v 4 "$APK" > /tmp/zipalign.log && echo "zipalign -P 16: OK" || { tail -20 /tmp/zipalign.log; echo "FAIL: zipalign 16 KB"; exit 1; }
TMP="$(mktemp -d)"; unzip -q "$APK" 'lib/*' -d "$TMP"
bad=0; n=0
for so in $(find "$TMP/lib/arm64-v8a" "$TMP/lib/x86_64" -name '*.so' 2>/dev/null); do
  n=$((n+1))
  while read -r align; do
    [ $((align)) -ge $((0x4000)) ] || { echo "FAIL: $(basename "$so") LOAD align $align"; bad=1; }
  done < <(readelf -lW "$so" | awk '$1=="LOAD"{print $NF}')
done
[ "$n" -gt 0 ] || { echo "FAIL: no native libs found"; exit 1; }
[ "$bad" -eq 0 ] || exit 1
echo "ELF LOAD alignment >= 16 KB: OK ($n libs checked)"
