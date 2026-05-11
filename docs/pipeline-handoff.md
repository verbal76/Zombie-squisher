# Mobile App Pipeline: OTA + APK via GitHub Actions

This is the standard deployment pipeline for any Expo / React Native project
that ships to Android via GitHub Actions. It supports two release channels
out of the same git branch:

- **OTA (Over-the-Air) update** — JS/TS-only changes, lands on user devices
  within seconds via Expo Updates. No app store, no APK install.
- **APK build** — full native rebuild via EAS Build on a GitHub runner.
  Required whenever native code, bundled assets, or build config changes.

A single `paths-ignore` filter on each workflow routes every push to the
correct lane automatically.

---

## 1. Mental model — when does each path fire?

Two GitHub Actions workflows watch the same branch. Their `paths-ignore`
lists are mirror images:

| What changed                                    | OTA fires? | APK fires? |
|-------------------------------------------------|------------|------------|
| `src/**` (TypeScript / React components)        | YES        | no         |
| `assets/**` (binary assets bundled into the app)| YES        | YES        |
| `package.json`, `app.json`, `eas.json`          | no         | YES        |
| `metro.config.js`, `babel.config.js`            | no         | YES        |
| `.github/**`, `**/*.md`, `scripts/**`           | no         | no         |

Why this split:

- **Native code / config changes can't be OTA'd** — they live in the APK
  binary. Routing them away from OTA prevents broken updates.
- **JS-only changes don't need a 10-minute APK rebuild** — they fly through
  OTA in ~30 seconds.
- **Bundled assets** need both: APK rebuild for binary inclusion, then the
  next `src/**` commit OTAs the JS that consumes them.
- **Docs / CI configs / build scripts** should fire neither workflow. They
  don't ship to users.

The single most important rule:

> **Never bump `expo.version` in `app.json` without also publishing a new
> APK.** Use `runtimeVersion: { policy: "appVersion" }`. If `appVersion`
> changes, OTAs stop reaching old installs because the runtime no longer
> matches.

---

## 2. Files you must create

### 2.1 `.github/workflows/android-build.yml` — the APK builder

```yaml
name: Android APK (GitHub Runner)

on:
  push:
    branches:
      - 'main'        # <-- replace with your working branch name
    paths-ignore:
      - 'src/**'
      - 'docs/**'
      - '**/*.md'
      - '.github/**'
      - 'scripts/**'
    tags:
      - 'v*'
  workflow_dispatch:
    inputs:
      profile:
        description: 'EAS build profile (preview = APK, production = AAB)'
        required: true
        default: 'preview'

concurrency:
  group: android-build-${{ github.ref }}
  cancel-in-progress: false

jobs:
  build:
    name: Build APK on GitHub runner
    runs-on: ubuntu-latest
    permissions:
      contents: write
    env:
      EXPO_TOKEN: ${{ secrets.EAS_TOKEN }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup Java 17
        uses: actions/setup-java@v4
        with:
          distribution: temurin
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Setup EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EAS_TOKEN }}

      - name: Install dependencies
        run: npm install --no-audit --no-fund

      - name: Generate build info
        run: node scripts/write-build-info.mjs

      - name: Prepare assets
        run: npm run prepare-assets

      - name: Determine profile
        id: profile
        run: |
          if [ "${{ github.event_name }}" = "push" ] && [[ "${{ github.ref }}" == refs/tags/* ]]; then
            echo "profile=production" >> "$GITHUB_OUTPUT"
            echo "outext=aab" >> "$GITHUB_OUTPUT"
          else
            echo "profile=${{ github.event.inputs.profile || 'preview' }}" >> "$GITHUB_OUTPUT"
            echo "outext=apk" >> "$GITHUB_OUTPUT"
          fi

      - name: Build with EAS (local)
        env:
          EXPO_TOKEN: ${{ secrets.EAS_TOKEN }}
        run: |
          mkdir -p build
          eas build \
            --platform android \
            --profile ${{ steps.profile.outputs.profile }} \
            --local \
            --non-interactive \
            --output build/app.${{ steps.profile.outputs.outext }}

      - name: Upload artifact
        uses: actions/upload-artifact@v4
        continue-on-error: true
        with:
          name: app-${{ steps.profile.outputs.profile }}-${{ github.run_number }}
          path: build/app.${{ steps.profile.outputs.outext }}
          retention-days: 90

      - name: Publish GitHub Release
        uses: softprops/action-gh-release@v2
        with:
          files: build/app.${{ steps.profile.outputs.outext }}
          tag_name: ${{ startsWith(github.ref, 'refs/tags/') && github.ref_name || format('apk-build-{0}', github.run_number) }}
          name: "${{ startsWith(github.ref, 'refs/tags/') && github.ref_name || format('APK build #{0}', github.run_number) }}"
          prerelease: false
          make_latest: "true"
          generate_release_notes: true
```

Key design points:

- `eas build --local` builds the APK on the GitHub runner itself, not on
  EAS cloud. Free for public repos. Avoids EAS Build queue waits.
- `github.run_number` becomes the build number in release tags
  (`apk-build-52`), so users can identify what they're running.
- Tag pushes (`v1.0.0`) flip to production AAB for Play Store submission.
- The Release step publishes a downloadable APK on the repo's Releases page
  for internal testers, QA, and rollback.

### 2.2 `.github/workflows/eas-update.yml` — the OTA pusher

```yaml
name: EAS Update (OTA)

on:
  push:
    branches:
      - 'main'        # <-- same branch as android-build.yml
    paths-ignore:
      - 'package.json'
      - 'package-lock.json'
      - 'app.json'
      - 'eas.json'
      - 'metro.config.js'
      - 'babel.config.js'
      - 'tsconfig.json'
      - '.github/**'
      - '**/*.md'
      - 'docs/**'
      - 'scripts/**'
  workflow_dispatch:
    inputs:
      branch:
        description: 'EAS update channel/branch (preview | production)'
        required: true
        default: 'preview'
      message:
        description: 'Update message'
        required: false
        default: ''

concurrency:
  group: eas-update-${{ github.ref }}
  cancel-in-progress: true

jobs:
  update:
    name: Publish OTA update
    runs-on: ubuntu-latest
    env:
      EXPO_TOKEN: ${{ secrets.EAS_TOKEN }}
    steps:
      - name: Checkout
        uses: actions/checkout@v4

      - name: Setup Node
        uses: actions/setup-node@v4
        with:
          node-version: 20

      - name: Setup EAS
        uses: expo/expo-github-action@v8
        with:
          eas-version: latest
          token: ${{ secrets.EAS_TOKEN }}

      - name: Install dependencies
        run: npm install --no-audit --no-fund

      - name: Generate build info
        run: node scripts/write-build-info.mjs

      - name: Prepare assets
        run: npm run prepare-assets

      - name: Publish update
        env:
          EXPO_TOKEN: ${{ secrets.EAS_TOKEN }}
        run: |
          BRANCH="${{ github.event.inputs.branch || 'preview' }}"
          MSG="${{ github.event.inputs.message }}"
          if [ -z "$MSG" ]; then
            MSG="$(git log -1 --pretty=%B | head -n1)"
          fi
          eas update --non-interactive --branch "$BRANCH" --message "$MSG"
```

`cancel-in-progress: true` is intentional. OTAs are cheap and idempotent —
if a developer pushes twice in 30 seconds, the second push should win and
the first run should die.

### 2.3 `app.json` — the runtime version contract

```json
{
  "expo": {
    "name": "YourApp",
    "slug": "your-app-slug",
    "owner": "your-eas-account",
    "version": "1.0.0",
    "orientation": "default",
    "userInterfaceStyle": "dark",
    "scheme": "yourapp",
    "newArchEnabled": false,
    "runtimeVersion": {
      "policy": "appVersion"
    },
    "splash": {
      "resizeMode": "contain",
      "backgroundColor": "#0a0a0a"
    },
    "updates": {
      "url": "https://u.expo.dev/<your-project-id>",
      "checkAutomatically": "ON_LOAD",
      "fallbackToCacheTimeout": 0
    },
    "ios": {
      "supportsTablet": true,
      "bundleIdentifier": "com.yourorg.yourapp"
    },
    "android": {
      "package": "com.yourorg.yourapp",
      "adaptiveIcon": {
        "backgroundColor": "#0a0a0a"
      }
    },
    "web": {
      "bundler": "metro"
    },
    "plugins": [
      "expo-updates",
      [
        "expo-build-properties",
        {
          "android": {
            "kotlinVersion": "1.9.25"
          }
        }
      ]
    ],
    "extra": {
      "eas": {
        "projectId": "<your-project-id>"
      }
    }
  }
}
```

Critical fields:

- `runtimeVersion.policy = "appVersion"` ties OTAs to the value of
  `expo.version`. **Do not bump `expo.version` unless you also publish a
  new APK** — old installs will stop receiving updates.
- `updates.url` and `extra.eas.projectId` are project-specific and come
  from `eas init`.
- `checkAutomatically: "ON_LOAD"` polls for OTAs on every cold start —
  this is what makes code changes appear within seconds of a push.

### 2.4 `eas.json` — build profiles

```json
{
  "cli": {
    "version": ">= 13.0.0",
    "appVersionSource": "remote"
  },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "channel": "development"
    },
    "preview": {
      "distribution": "internal",
      "channel": "preview",
      "android": {
        "buildType": "apk"
      }
    },
    "production": {
      "channel": "production",
      "autoIncrement": true,
      "android": {
        "buildType": "app-bundle"
      }
    }
  },
  "submit": {
    "production": {}
  }
}
```

The `channel` keys must match the OTA channel names used in
`eas update --branch <channel>`. Devices running a `preview` APK only
receive OTAs published to the `preview` channel.

### 2.5 `scripts/write-build-info.mjs` — build identification

Without this script, you cannot tell what version is running on a user's
phone. It runs in both workflows and writes a generated TypeScript file
that the app reads at runtime, typically surfaced in an About / Debug
modal.

```javascript
import { execSync } from 'node:child_process';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

const OUTPUT = 'src/__generated__/build-info.ts';

const git = (cmd, fallback = '') => {
  try { return execSync(`git ${cmd}`, { encoding: 'utf8' }).trim(); }
  catch { return fallback; }
};

const branch       = git('rev-parse --abbrev-ref HEAD', 'unknown');
const commit       = git('rev-parse HEAD', 'unknown');
const commitShort  = git('rev-parse --short HEAD', 'unknown');
const dirty        = git('status --porcelain') !== '';
const builtAt      = new Date().toISOString();

const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
const app = JSON.parse(readFileSync('app.json', 'utf8'));
const appVersion         = pkg.version ?? app?.expo?.version ?? 'unknown';
const androidVersionCode = app?.expo?.android?.versionCode ?? null;

const buildId = `build ${commitShort} (${branch})${dirty ? ' [dirty]' : ''}`;
const otaId   = `OTA ${commitShort} @ ${builtAt}`;

const data = {
  branch, commit, commitShort, dirty, builtAt,
  appVersion, androidVersionCode,
  buildId, otaId,
};

mkdirSync(dirname(OUTPUT), { recursive: true });
writeFileSync(OUTPUT,
  `// AUTO-GENERATED by scripts/write-build-info.mjs. Do not edit.\n` +
  `export interface BuildInfo {\n` +
  `  branch: string; commit: string; commitShort: string;\n` +
  `  dirty: boolean; builtAt: string;\n` +
  `  appVersion: string; androidVersionCode: number | null;\n` +
  `  buildId: string; otaId: string;\n` +
  `}\n` +
  `export const BUILD_INFO: BuildInfo = ${JSON.stringify(data, null, 2)};\n`
);

console.log(`write-build-info: ${branch}@${commitShort}${dirty ? ' (dirty)' : ''}`);
```

Then `src/__generated__/build-info.ts` (gitignored, regenerated on each
build) can be imported anywhere:

```ts
import { BUILD_INFO } from './__generated__/build-info';
// BUILD_INFO.commitShort -> "1cff040"
// BUILD_INFO.buildId     -> "build 1cff040 (main)"
```

Surface it in a debug or About modal so testers and developers can confirm
which commit is live.

Add to `.gitignore`:

```
src/__generated__/
```

### 2.6 `metro.config.js` — binary assets and ESM resolution

If the project loads binary assets that aren't images (3D models, audio,
video, fonts beyond the defaults, custom file formats), Metro needs
explicit permission to bundle them. Without it, `require()`ing the file
silently returns `undefined` and fails at runtime.

```javascript
const { getDefaultConfig } = require('expo/metro-config');

const config = getDefaultConfig(__dirname);

// Enable package.json `exports` field resolution. Required for ESM-only
// npm packages (modern Three.js, some chart libraries, etc.). Without it,
// deep submodule imports fail to resolve.
config.resolver.unstable_enablePackageExports = true;

// Whitelist binary asset extensions Metro should bundle. Extend this list
// for whatever file types your project consumes.
for (const ext of ['glb', 'gltf', 'mp3', 'wav', 'ogg', 'mp4']) {
  if (!config.resolver.assetExts.includes(ext)) {
    config.resolver.assetExts.push(ext);
  }
}

module.exports = config;
```

Two pieces both matter:

- `unstable_enablePackageExports = true` — required for ESM-only npm
  packages. Without it, deep imports like
  `library/dist/some-submodule.js` fail.
- The `assetExts` push tells Metro to treat the listed extensions as
  bundled assets rather than trying to parse them as JavaScript.

### 2.7 `package.json` — required scripts

```json
{
  "scripts": {
    "start": "expo start",
    "android": "expo run:android",
    "ios": "expo run:ios",
    "prepare-assets": "node scripts/prepare-assets.mjs",
    "build-info": "node scripts/write-build-info.mjs"
  }
}
```

The `prepare-assets` script is project-specific. A common job is generating
launcher icons from a single source PNG, but the slot is generic — use it
for any pre-build asset transformation step. Both workflows invoke it
before the build/update step.

If your project has no asset prep work, define it as a no-op so the
workflow steps don't fail:

```json
"prepare-assets": "echo 'no asset prep'"
```

### 2.8 `.github/workflows/prune-artifacts.yml` — storage-quota safeguard

GitHub Actions enforces a fixed artifact storage quota per account. Once
hit, every subsequent upload step fails. This workflow keeps the repo
permanently under quota by deleting all but the 3 newest artifacts.

```yaml
name: Prune Artifacts
# Keep only the 3 most recent artifacts repo-wide so we stay under the
# storage quota. Runs daily, manually, and after every build completes.

on:
  workflow_dispatch:
  schedule:
    - cron: '0 6 * * *'
  workflow_run:
    workflows: ['Android APK (GitHub Runner)']
    types: [completed]

permissions:
  actions: write

jobs:
  prune:
    runs-on: ubuntu-latest
    steps:
      - name: Delete all but the 3 newest artifacts
        uses: actions/github-script@v7
        with:
          script: |
            const KEEP = 3;
            const { owner, repo } = context.repo;
            const all = await github.paginate(
              github.rest.actions.listArtifactsForRepo,
              { owner, repo, per_page: 100 }
            );
            const sorted = all.sort(
              (a, b) => new Date(b.created_at) - new Date(a.created_at)
            );
            const toDelete = sorted.slice(KEEP);
            core.info(`Found ${sorted.length} artifacts; keeping ${Math.min(KEEP, sorted.length)}, deleting ${toDelete.length}.`);
            for (const a of toDelete) {
              core.info(`Deleting ${a.name} (id=${a.id}, created=${a.created_at})`);
              await github.rest.actions.deleteArtifact({
                owner, repo, artifact_id: a.id,
              });
            }
```

Three triggers, three roles:

- `workflow_dispatch` — manual sweep button in the Actions UI. Used once
  per repo right after the workflow lands, to drain whatever backlog has
  already accumulated.
- `schedule: cron '0 6 * * *'` — daily safety net at 06:00 UTC, catches
  anything missed by the chained trigger.
- `workflow_run` — fires the instant the build workflow completes, so
  pruning happens in real time as new artifacts appear.

`KEEP = 3` is the only behavioral knob. Bump it to 5 or 10 if you want
more history; the script handles any positive integer.

Uses `actions/github-script@v7` with the job's built-in `GITHUB_TOKEN`.
No PAT, no extra secret. The `permissions: actions: write` block is the
only authorization needed; without it the delete call returns 403.

Two adjustments per project:

1. `workflows: ['Android APK (GitHub Runner)']` — replace the string in
   the array with the exact `name:` from your build workflow's first
   line (case-sensitive). If the project has no chainable build workflow,
   delete the entire `workflow_run:` block — cron + manual still cover
   you, just on a 24-hour rhythm instead of real-time.
2. Multiple build workflows can be chained by listing them all:
   `workflows: ['CI', 'Release Build']`.

---

## 3. Loading binary assets in your app

This bites every project that loads non-image binaries at runtime.
**`fetch()` of `file://` URIs is unreliable on Android.** It returns an
empty body, hangs indefinitely, or both. The fix is to read via
`expo-file-system` and decode base64 to ArrayBuffer manually.

```ts
import { Asset } from 'expo-asset';
import * as FileSystem from 'expo-file-system';

async function readBinaryAsset(mod: number): Promise<ArrayBuffer> {
  const asset = Asset.fromModule(mod);
  await asset.downloadAsync();
  const uri = asset.localUri ?? asset.uri;
  if (!uri) throw new Error('asset has no URI');

  // fetch() of file:// URIs is unreliable on Android. Read as base64 via
  // expo-file-system, then decode to ArrayBuffer using Hermes' global atob.
  const b64 = await FileSystem.readAsStringAsync(uri, {
    encoding: FileSystem.EncodingType.Base64,
  });
  const binStr = atob(b64);
  const bytes = new Uint8Array(binStr.length);
  for (let i = 0; i < binStr.length; i++) bytes[i] = binStr.charCodeAt(i);
  return bytes.buffer;
}

// Usage:
const buffer = await readBinaryAsset(require('../../assets/file.bin'));
```

`atob` is a Hermes global in modern Expo (52+). For older runtimes,
polyfill via the `base-64` npm package.

For image textures use `Image` or the framework's image loader directly
with the asset URI — that codepath is reliable on Android.

---

## 4. Pushing commits — the proxy author problem

When this pipeline is operated by an AI assistant or any non-human agent,
the local git proxy typically **rejects commits whose author is not the
session owner**. A `git push` from an unauthorized author returns:

```
RPC failed; HTTP 403 curl 22 The requested URL returned error: 403
send-pack: unexpected disconnect while reading sideband packet
```

Two reliable routes around this:

### 4.1 GitHub MCP `push_files` for text-only changes

This MCP tool commits via the GitHub REST API as the authenticated user.
Use it for any change that's purely text — TS, TSX, JS, JSON, YAML, MD,
CSS, HTML.

```
mcp__github__push_files({
  owner: "<github-org-or-user>",
  repo: "<repo-name>",
  branch: "main",
  message: "Short commit subject\n\nLonger body explaining why.",
  files: [
    { path: "src/file.ts", content: "<full file contents as a string>" },
    { path: "src/other.tsx", content: "..." }
  ]
})
```

After the MCP push, sync your local repo:

```bash
git fetch origin main
git reset --hard origin/main
```

This discards the locally-rejected commit and adopts the remote's MCP
commit. Local SHA now matches remote SHA.

### 4.2 Binary files

The MCP `push_files` tool transmits text. **Binary files of any
appreciable size cannot be chunked through it reliably** — output token
budgets clip the base64 payload mid-stream and the file lands corrupt.

For binaries, ask the operator to upload them via the GitHub web UI
("Add file" → "Upload files") and then `git pull` to pick them up.

Empty placeholder folders that the GitHub web UI sometimes creates
(1-byte files named after the directory) need to be cleaned up:

```
mcp__github__delete_file({
  owner, repo, branch,
  path: "assets/placeholder-folder",
  message: "Remove placeholder",
})
```

---

## 5. Standard workflow for a code change

The full loop:

1. **Make your edits** with whatever tooling the agent has access to.
2. **Decide OTA vs APK** by looking at which files changed:
   - `src/**` only → OTA (auto-triggers on push)
   - `assets/**`, `metro.config.js`, `package.json`, etc. → APK
3. **Commit locally** with a clear message.
4. **Attempt `git push`.** If it 403s, fall back to
   `mcp__github__push_files` with the same files and message.
5. **Sync local to remote:** `git fetch && git reset --hard origin/<branch>`.
6. **Report to operator:** "Shipped as OTA for build #N" or "Triggered APK
   build #N+1". Use `mcp__github__get_latest_release` if you need the
   actual run number.

When in doubt about which workflow fires, apply the rule:

> If every changed file matches an entry in OTA's `paths-ignore`, OTA skips.
> If every changed file matches an entry in APK's `paths-ignore`, APK skips.
> Most `src/**` changes fire OTA only; most config and asset changes fire
> APK only; some changes (rare) fire both, which is fine.

---

## 6. Common pitfalls and their symptoms

| Symptom                                          | Cause                                          | Fix                                                          |
|--------------------------------------------------|-----------------------------------------------|--------------------------------------------------------------|
| OTAs stop reaching old APK installs              | `expo.version` bumped without new APK         | Revert the version bump or publish a new APK at the new version |
| Push returns 403 from local proxy                | Commit author isn't session owner             | Use `mcp__github__push_files` for text; web UI for binaries  |
| Binary asset returns empty on Android only       | `fetch()` on `file://` URI hangs              | Switch to `expo-file-system.readAsStringAsync` + `atob`       |
| `require('./file.glb')` returns undefined        | Metro not bundling that extension              | Add ext to `config.resolver.assetExts` in `metro.config.js`  |
| ESM submodule import fails at bundle time        | `exports` field not resolved                   | `config.resolver.unstable_enablePackageExports = true`       |
| OTA workflow doesn't fire on `src/**` push       | `src/**` accidentally in OTA's `paths-ignore` | Remove it; keep it only in APK workflow's `paths-ignore`     |
| APK build fires on every doc tweak               | `**/*.md` missing from APK workflow's ignore  | Add it to `paths-ignore`                                     |
| Build info shows "unknown" commit hash           | `scripts/write-build-info.mjs` not run         | Add the step to both workflows before `eas build` / `update` |
| EAS auth fails in CI                             | `EXPO_TOKEN` secret not set                    | Add `EAS_TOKEN` (or your chosen name) to repo Actions secrets |

---

## 7. Verification checklist for a new project

After completing the setup above, smoke-test the pipeline in this order:

1. Push an `.md` file change. **Neither workflow should fire.**
2. Push a comment-only change to a `src/**` file. **OTA fires, APK does not.**
3. Push a `metro.config.js` whitespace change. **APK fires, OTA does not.**
4. Install the resulting APK on a test device. Open the build-info / About
   surface and confirm the commit hash matches the push that triggered it.
5. Push another `src/**` change. Wait ~30 seconds, force-close and reopen
   the app. The OTA commit hash should update; the APK commit hash should
   stay on the previous build.

If all five pass, the pipeline is live and the contract is verified.

---

## 8. EAS account setup (one-time, manual)

This section requires the operator's hands — it cannot be scripted by an
agent:

1. `npm install -g eas-cli`
2. `eas login`
3. `eas init` in the repo root — generates the `projectId` for `app.json`.
4. `eas update:configure` — wires up `updates.url`.
5. In the GitHub repo settings → Secrets → Actions, add `EAS_TOKEN` with a
   token from `eas account:tokens:create` (or use an Expo personal access
   token).
6. Confirm the EAS dashboard shows the project at
   `https://expo.dev/accounts/<owner>/projects/<slug>`.

Once these steps are done, the workflows run end-to-end without further
manual intervention.

---

## 9. Branch naming and channel alignment

Pick a single working branch — `main`, `develop`, `release/<name>`, or
similar — and put its name in three places:

- `branches:` list in `android-build.yml`
- `branches:` list in `eas-update.yml`
- The fallback in `write-build-info.mjs` reads the current branch from git
  and surfaces it; the script doesn't need editing, but verify the
  displayed branch matches expectations after a build.

If you need parallel development on multiple branches, **also create
parallel EAS channels per branch**. OTAs published to the `preview`
channel land on every APK built against `preview` regardless of which
branch shipped them. Branch-per-channel keeps testing isolated:

| Branch        | EAS channel | Used for             |
|---------------|-------------|----------------------|
| `main`        | `production` | Play Store releases  |
| `develop`     | `preview`   | Internal testers     |
| `feature/*`   | `development` | Local dev builds   |

---

## 10. Summary

The pipeline ships in 8 files plus the EAS setup steps:

- `.github/workflows/android-build.yml`
- `.github/workflows/eas-update.yml`
- `.github/workflows/prune-artifacts.yml`
- `app.json`
- `eas.json`
- `metro.config.js`
- `scripts/write-build-info.mjs`
- `package.json` (scripts section)

Total setup time on a new repo, once the operator has done the EAS account
work and obtained an Android signing key, is approximately 30 minutes.

---

## 11. Per-repo rollout to additional projects

Use this section when adding the prune-artifacts workflow (or any other
piece of the pipeline) to a new repository in the same fleet. The steps
are straightforward but contain non-obvious gotchas worth surfacing.

### 11.1 Find the default branch — do not assume `main`

GitHub workflows are only honored on the default branch (see 11.4). The
default branch can be anything: `main`, `master`, `develop`, or in some
projects the de-facto-main branch itself if no separate workflow-only
branch was ever set up. Three discovery routes:

- **Web**: open `github.com/<owner>/<repo>` and read whichever branch the
  dropdown shows — that's the default.
- **Local terminal**: `git remote show origin` and look for the
  `HEAD branch:` line.
- **API / agent**: read repo metadata; the `default_branch` field is
  returned by the standard repo-info endpoint
  (`GET /repos/{owner}/{repo}`).

If the default branch is also where active work lives, that's fine — one
push to it covers both roles.

### 11.2 Find the build workflow's exact `name:`

Look in `.github/workflows/` on the default branch for whichever file
builds the APK (`./gradlew assembleDebug`, `eas build`, or similar). Open
it. The very first line is `name: <something>`. Copy that string
verbatim, case-sensitive. Examples seen in the fleet:

- `Android APK (GitHub Runner)` — repos on the local-build pipeline
  (this template)
- `EAS Build (Android APK)` — repos still on EAS-cloud builds
- `CI`, `Build APK`, `Release` — ad-hoc setups

If the repo has no relevant build workflow at all, see 11.3.

### 11.3 Decision logic for the `workflow_run` block

- **Has a build workflow worth chaining off** → put the exact name from
  11.2 into the `workflows:` array.
- **Has no build workflow** OR **don't want real-time chaining** →
  delete the entire `workflow_run:` block (three lines). The
  `schedule:` cron + `workflow_dispatch:` manual trigger still work
  fine; you just lose the post-build immediate prune.
- **Has multiple chainable build workflows** → list them all:
  `workflows: ['CI', 'Release Build']`.

### 11.4 Critical — the file MUST live on the default branch

GitHub reads workflow definitions for `schedule:`, `workflow_run:`, and
the Actions-UI **Run workflow** button **only from the default branch**.
Push the file to a feature branch and:

- The workflow's URL 404s.
- `schedule:` and `workflow_run:` triggers silently never fire.
- The **Run workflow** button doesn't appear in the Actions UI.

If the repo's default branch isn't where day-to-day code work lives,
that's fine — workflows belong on the default branch by convention. Just
target it explicitly:

```
mcp__github__push_files({
  owner, repo,
  branch: "<default_branch from 11.1>",
  ...
})
```

### 11.5 One-time activation

After the push, `schedule:` and `workflow_run:` only fire on **future**
events. To clear an already-overfull repo immediately:

1. Go to `github.com/<owner>/<repo>/actions/workflows/prune-artifacts.yml`
2. Click **Run workflow** dropdown → **Run workflow** button.
3. Watch the run log; expect output like
   `Found 27 artifacts; keeping 3, deleting 24.` followed by a delete
   line per artifact.

From then on, the cron + chain triggers maintain it. No further
intervention needed.

### 11.6 Abbreviated brief for an in-repo Claude instance

Hand this to a Claude in each target repo:

> Add `prune-artifacts.yml` to this repo. Steps:
> 1. Determine the default branch via repo metadata (do not assume
>    `main`).
> 2. Find the APK/build workflow file under `.github/workflows/` on the
>    default branch and read its `name:` line exactly.
> 3. Use `mcp__github__create_or_update_file` (or `push_files`) to push
>    `prune-artifacts.yml` to the **default branch** with the workflow
>    name substituted into `workflows: [...]`. If there's no build
>    workflow worth chaining, delete the entire `workflow_run:` block.
> 4. Tell the user to fire it once from the Actions tab
>    (**Run workflow**) to drain the initial backlog. From then on it
>    self-maintains.
