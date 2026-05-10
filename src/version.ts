// Manually bumped version constants. Mirrors the BUILD_VERSION / OTA_VERSION
// pair from the version-tracking spec.
//
// Bump BUILD_VERSION every time a new APK is shipped (native rebuild).
// Bump OTA_VERSION on each JS-only OTA push within the same APK lifecycle.
// Reset OTA_VERSION to '1' whenever BUILD_VERSION is bumped.

export const BUILD_VERSION = '1.0.0';
export const OTA_VERSION = '1';
