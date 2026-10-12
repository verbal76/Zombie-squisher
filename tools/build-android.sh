#!/usr/bin/env bash
# Local Android APK build with the same steps and gates as .github/workflows/build-apk.yml.
# Needs: Android SDK (ANDROID_HOME, platform 36, build-tools 36, NDK 27.1), JDK 17, EXPO_TOKEN (remote EAS credentials, so the
# APK carries the shipped signing key). Usage: tools/build-android.sh <out-dir> [build-number]
set -euo pipefail
OUT="${1:?out dir}"; BN="${2:-}"
: "${EXPO_TOKEN:?EXPO_TOKEN is required (signing credentials live on EAS)}"
: "${ANDROID_HOME:?ANDROID_HOME is required}"
export GITHUB_SHA="${GITHUB_SHA:-$(git rev-parse HEAD)}"
[ -n "$BN" ] && export BUILD_NUMBER="$BN"
PACKAGE=com.verbal76.zombiesquisher
EXPECTED_SIGNER=178015BD0312E195272E308093F551B9DC1436A1869B79B3E8CF1497BF0DA4EC
npm run check
node scripts/write-build-info.mjs
npm run prepare-assets
mkdir -p build "$OUT"
npx eas-cli build --platform android --profile preview --local --non-interactive --output build/raw.apk
APK_PATH=$(node tools/apk-name.js build/raw.apk "$OUT")
VC=$(node -p "require('./app.json').expo.android.versionCode"); VN=$(node -p "require('./app.json').expo.version")
tools/verify-apk.sh "$APK_PATH" "$PACKAGE" "$VC" "$VN" "$EXPECTED_SIGNER"
(cd "$OUT" && sha256sum "$(basename "$APK_PATH")" | tee "$(basename "$APK_PATH").sha256")
node tools/build-manifest.js "$APK_PATH" preview
echo "built $APK_PATH"
