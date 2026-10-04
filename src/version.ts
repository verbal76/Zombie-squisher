// Version identifiers, now auto-derived from BUILD_INFO so they reflect the
// exact commit running rather than a hand-bumped string that drifts.
//
// To prepend a milestone label, edit scripts/write-build-info.mjs's buildId/
// otaId template strings.

import { BUILD_INFO } from './__generated__/build-info';

export const BUILD_VERSION = BUILD_INFO.buildId;
export const OTA_VERSION   = BUILD_INFO.otaId;
