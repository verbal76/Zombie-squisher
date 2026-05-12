# GLB Render Pipeline on Expo + RN + three.js

A working pipeline for loading and rendering GLB models in an Expo
(managed prebuild) React Native app using three.js + expo-gl. Every
item below is hard-won — each is a bug we hit and the fix that worked.
Pair this document with `pipeline-handoff.md`, which covers the OTA +
APK deployment side of the same stack.

---

## Stack assumed

- **Expo SDK 52** with managed prebuild
- **expo-gl** for the OpenGL context
- **three.js 0.166** with `three/examples/jsm/loaders/GLTFLoader`
- **Hermes** JS engine (RN default)
- **expo-asset** + **expo-file-system** for binary asset reads
- **upng-js** if you need to decode PNGs at runtime (and you probably do —
  see bug 5)

---

## The 10 distinct bugs to expect (in order, with fix)

Any team starting from scratch will hit roughly this sequence.

### 1. `fetch(file://...)` returns empty body for binary assets on Android

GLTFLoader hands you a zero-byte buffer.

**Fix:** read the asset via `expo-file-system` as base64, then decode to
`ArrayBuffer` manually. Decode preference: `Buffer.from(b64, 'base64')`
first because it's fast and native; fall back to `atob` plus a
`charCodeAt` loop. Then pass the `ArrayBuffer` to
`GLTFLoader.parse(buffer, '', resolve, reject)` — skip the URL-based
`load` entirely.

### 2. Android AAPT silently corrupts `.glb` binaries

**Symptom:** `GLTFLoader.parse` throws `"Unsupported version"` or other
binary-corruption errors on APK-installed builds, but works fine in
Expo Go.

**Cause:** Android packager compresses unknown extensions by default,
mangling the raw bytes.

**Fix:** an Expo config plugin that injects an `androidResources` block
with `noCompress 'glb'` and `noCompress 'gltf'` into
`android/app/build.gradle`, then register it in `app.json`'s `plugins`
array. The plugin patches the file at prebuild time; the GLBs then ship
uncompressed and the loader can decode them.

### 3. `navigator.userAgent` is undefined in Hermes; GLTFLoader crashes

**Symptom:** `"Cannot read property 'match' of undefined"` on every
single GLB parse.

**Cause:** `GLTFParser` constructor (three.js r169 around line 2579)
reads `navigator.userAgent`. Hermes has `navigator` as a truthy object
but `userAgent` is undefined. The `typeof navigator !== 'undefined'`
guard passes, then `.match()` blows up.

**Fix:** a polyfill module with side effects only that sets
`navigator.userAgent = 'react-native'`. Import it before any GLTFLoader
import. CommonJS hoists imports to file top, so keeping it in its own
module guarantees ordering.

### 4. `renderer.resetState()` throws on first render

**Symptom:** render loop dies before frame 1.

**Cause:** expo-gl's GL context doesn't implement every WebGL call
`resetState` relies on.

**Fix:** just don't call it. Three.js initializes state cleanly on its
own.

### 5. Hermes has no `Image` constructor → three.js TextureLoader creates Texture with `image=undefined`

**Symptom:** `WebGLRenderer` crashes on first texture upload with
`"Cannot read property 'width' of undefined"` from
`WebGLTextures.getDimensions` (around line 26257 of three's bundle).
Kills the render loop before clear.

**Two fixes needed in tandem:**

1. **Strip all material texture refs at GLB parse time** — traverse the
   parsed scene and null out every map-like property on every material:
   `map, normalMap, roughnessMap, metalnessMap, emissiveMap, aoMap,
   bumpMap, displacementMap, alphaMap, lightMap, specularMap, envMap,
   gradientMap, matcap, clearcoatMap, clearcoatRoughnessMap,
   clearcoatNormalMap, sheenColorMap, sheenRoughnessMap, transmissionMap,
   thicknessMap, iridescenceMap, iridescenceThicknessMap, anisotropyMap`.
   The GLB's authored materials are unusable in RN anyway.
2. **If you need PNG texture data at all, decode it manually** (see bug 6).

### 6. Even DataTexture upload from a manually decoded PNG can give you black meshes in expo-gl

**Symptom:** manually decoded PNG → `DataTexture` → assigned to
`material.map` → mesh renders pure black on device.

**Cause:** expo-gl + three.js's texture-upload path is broken in some
combination we never fully nailed down. May be related to RGBA vs RGB
internal format, or a `flipY` / `UNPACK_ALIGNMENT` mismatch.

**Fix:** skip the GPU texture path entirely.

- Decode the PNG with `upng-js` to get a raw `Uint8Array`.
- Build a CPU sampler closure `(u, v) → [r, g, b]` that indexes the
  byte array directly.
- Bake per-vertex colors into the geometry at load time by iterating
  every UV, calling the sampler, and writing into a new `"color"`
  `BufferAttribute`.
- Material becomes `MeshBasicMaterial` with `color: 0xffffff` and
  `vertexColors: true`.

No texture upload ever happens. Bullet-proof.

### 7. Models that use very low UVs (~0.014, 0.014) can render black even with a correct sampler

Common in palette-texture-based asset packs where the artist places the
swatch grid in one corner.

**Symptom:** sampled black even though you know the palette has colors.

**Cause:** many palette PNGs have black in the top-left pixels. If you
flip v with `1 - v`, low UVs map to the BOTTOM of the image, which can
also be black. Two black regions, two different reasons.

**Fix:** don't flip v unless your palette specifically requires it. Add
a small in-app diagnostic that prints the palette dimensions, the first
12 bytes, and the byte triple sampled at a known low UV, so you can
verify on-device.

### 8. Nested mesh hierarchies cause double-translation bugs

**Symptom:** spawned children (bullets, particles, attachment points)
appear offset from the visible mesh by roughly one mesh-width.

**Cause:** GLBs are often authored as `Group → Group → Mesh`. If you do
`mesh.geometry.applyMatrix4(mesh.matrixWorld)` then
`mesh.position.set(0,0,0)`, the parent Group's transform still applies
at render time → double translation.

**Fix:** flatten on bake.

- Walk all descendant meshes.
- `clone()` each geometry, `applyMatrix4(obj.matrixWorld)` to absorb the
  entire transform chain into geometry coords.
- Empty the inner container's children.
- Re-attach the captured meshes as flat children of the container with
  identity transforms.
- Compute bbox and scale-to-target-size as a second pass.

### 9. Frustum culling with a degenerate bounding sphere makes meshes invisible

**Symptom:** certain meshes never render even when everything else is
correct.

**Cause:** `frustumCulled` defaults `true`. After scale + center
transforms, some meshes can have an off-center or zero-radius
`boundingSphere`, and three's culler decides "off-screen" every frame.

**Fix (defensive):** set `obj.frustumCulled = false` on every mesh in
the material-replacement pass. For small scenes the culler buys you
nothing. Also re-compute bbox and sphere after every geometry transform
by calling `geometry.computeBoundingBox()` and
`geometry.computeBoundingSphere()`.

### 10. sRGB double-encoding washes out colors

**Symptom:** every color looks pale and faded versus the source palette.

**Cause:** renderer has `outputColorSpace = THREE.SRGBColorSpace`, so
it gamma-encodes its output. If you feed raw `byte/255` as a vertex
color, those bytes are already sRGB-encoded values, so they get encoded
twice — midtones lift, darks flatten.

**Fix:** precompute a 256-entry sRGB→linear lookup table once, apply
per channel at sample time before writing to the color `BufferAttribute`.
The renderer's output encoding then lands on the original sRGB byte
value. Do NOT use `material.color.convertSRGBToLinear()` — it only fixes
the flat material color channel, not vertex colors.

---

## Recommended module layout

- **`_polyfills`** — side effects only. Sets `navigator.userAgent`.
  Must be imported before anything that imports GLTFLoader.
- **`assetLoader`** — exposes `loadGLBAsArrayBuffer(mod)` (runs
  `Asset.fromModule` + `downloadAsync` +
  `FileSystem.readAsStringAsync(base64)` + base64-to-ArrayBuffer) and
  `parseGLB(buffer)` which wraps `GLTFLoader.parse` in a Promise. Cache
  buffers by module id. Export a `loadModel(mod)` that chains the two
  and then `stripTextures(scene)`.
- **`palette` / `texture`** module if you have one. Decode once via
  `upng-js` into a `Uint8Array` + width/height. Expose a sampler closure
  and, optionally, a DataTexture builder for any path that genuinely
  needs the texture (rare).
- **`renderer`** — owns `onContextCreate(gl)`. Builds a `fakeCanvas`
  shim:
  ```
  { width, height, style: {}, clientHeight, clientWidth,
    addEventListener: noop, getContext: () => gl,
    ownerDocument: { defaultView: { devicePixelRatio: 1 } },
    setPointerCapture: noop }
  ```
  Constructs `WebGLRenderer` with that canvas + the gl context. Sets
  `outputColorSpace = SRGBColorSpace`.
- **`loadStatus`** — module-level counters: `total, loaded, failed,
  firstError, renderError, renderStack, renderFrames, initError,
  drawBufW, drawBufH, sceneChildren, paletteDiag`. Surface in an in-app
  diagnostic overlay. **You cannot debug this stuff with console logs
  on a phone.**
- **Expo config plugin** — injects the `noCompress` block for
  `.glb` / `.gltf` into `android/app/build.gradle`. Register it in the
  `plugins` array of `app.json`.

---

## Build-time pipeline

1. Metro bundles every GLB you reference via `require()`. Keep all GLB
   `require()` calls in a single static table so the bundler discovers
   them.
2. Expo prebuild runs the `noCompress` plugin which patches
   `android/app/build.gradle`.
3. Your APK build workflow runs `gradlew assembleRelease`. APK can be
   signed with the auto-included debug keystore so no signing secrets
   are required for sideload builds.

---

## Runtime pipeline (cold start)

1. `GLView`'s `onContextCreate` fires with the `gl` handle.
2. Build the renderer over the `fakeCanvas` shim.
3. If you use a palette texture, decode it now and build the sampler.
4. `Promise.all` over every GLB. Each load:
   - read file as base64 (`expo-file-system`),
   - convert base64 to `ArrayBuffer` (`Buffer.from`),
   - call `GLTFLoader.parse(buffer)` → `gltf.scene`,
   - run `stripTextures(scene)`,
   - run `bakeGeometryTransforms(inner, targetSize)` to flatten + scale,
   - run `bakeVertexColors(mesh, sampler)` per mesh,
   - stash in a templates map keyed by name.
5. Start the render loop.
6. For each entity: clone the template, replace materials with
   `MeshBasicMaterial({ color, vertexColors })`, position/scale/rotate,
   add to scene.
7. Wrap every frame's `renderer.render(scene, camera)` + `gl.endFrameEXP()`
   in a `try/catch` that writes the first error's message and stack to
   the diagnostic module so you can see it in-app.

---

## Diagnostics worth shipping in an in-app overlay

- **Templates loaded:** X of Y
- **First load error:** name + truncated message
- **Drawing buffer dimensions** (zero means context is dead)
- **Scene children count**
- **Frames rendered counter** (heartbeat)
- **Render error** and truncated stack
- **Init error** from before the render loop started
- **Palette diag** if applicable: dimensions, first 12 bytes, sample
  bytes at the known low UV your models use

Make all of this visible on a single screen the user can read without a
debugger.

---

## Things to NOT do

- Don't use three.js `TextureLoader` — no `Image` constructor in Hermes.
- Don't use expo-three's `loadAsync` — it pulls in conflicting peers
  and the texture path is broken anyway.
- Don't call `renderer.resetState()`.
- Don't trust `frustumCulled = true` — meshes with degenerate bounds
  will silently vanish.
- Don't reflexively flip v when sampling palette textures; verify
  on-device first.
- Don't feed raw `byte/255` to vertex colors; sRGB → linear first.
- Don't try to debug any of this with `console.log` — ship a diagnostic
  surface on day one.

---

## Channel / OTA gotcha (adjacent but bites everyone)

If you use `expo-updates` with channels, the channel name MUST be
present in `AndroidManifest`. On EAS Build it's auto-injected; on a
self-hosted prebuild (GitHub Actions, etc.) it isn't, so OTAs silently
fail because the device doesn't know which branch to ask.

**Fix:** set the env var `EXPO_UPDATES_CHANNEL=<channel>` on the
`expo prebuild` step. Also list it in `app.json` under `updates.channel`
for belt-and-braces.

---

That's the full set. Hand this to the other team and they should be able
to skip most of the multi-week diagnosis loop.

For the surrounding deployment pipeline (OTA + APK + prune-artifacts
workflows, EAS setup, runtimeVersion contract), see
[`pipeline-handoff.md`](./pipeline-handoff.md).
