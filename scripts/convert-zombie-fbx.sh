#!/usr/bin/env bash
# Convert the zombie FBX files (mesh + idle/run/jump anims) into a single
# animated GLB suitable for three.js GLTFLoader on React Native.
#
# Inputs (place under assets/zombie-src/):
#   characterMedium.fbx       (skinned mesh + skeleton, no anim)
#   idle.fbx                  (animation only)
#   run.fbx                   (animation only)
#   jump.fbx                  (animation only)
#   colormap.png, normalmap.png  (optional textures referenced by the mesh)
#
# Output:
#   assets/zombies/zombie.glb
#
# Requires FBX2glTF on PATH. Install:
#   npm i -g fbx2gltf            # JS wrapper around the Facebook fbx2gltf binary
#   # or grab a release from https://github.com/facebookincubator/FBX2glTF
#
# After this runs, commit assets/zombies/zombie.glb with a normal `git push`
# (binary, must go through real git — the MCP push tool can't carry binaries).

set -euo pipefail
cd "$(dirname "$0")/.."

SRC=assets/zombie-src
OUT=assets/zombies
mkdir -p "$OUT"

if [ ! -f "$SRC/characterMedium.fbx" ]; then
  echo "missing $SRC/characterMedium.fbx — drop the four FBX files into $SRC/ first" >&2
  exit 1
fi

# Merge the mesh + three animation clips into one GLB.
# FBX2glTF takes one input and emits one output, so we use --anim-framerate
# bake30 and --keep-attribute to preserve skinning, then post-merge clips with
# gltf-transform.
fbx2gltf \
  --binary \
  --keep-attribute auto \
  --anim-framerate bake30 \
  --input  "$SRC/characterMedium.fbx" \
  --output "$OUT/zombie-mesh"

# Convert each anim clip into its own GLB with the same skeleton, then merge
# tracks into the mesh GLB using gltf-transform.
for clip in idle run jump; do
  fbx2gltf \
    --binary \
    --anim-framerate bake30 \
    --input  "$SRC/$clip.fbx" \
    --output "$OUT/zombie-$clip"
done

# Merge: mesh + 3 clips → single zombie.glb with three named animations.
# Requires `npm i -g @gltf-transform/cli`.
gltf-transform merge \
  "$OUT/zombie-mesh.glb" \
  "$OUT/zombie-idle.glb" \
  "$OUT/zombie-run.glb"  \
  "$OUT/zombie-jump.glb" \
  "$OUT/zombie.glb"

# Strip per-clip files; keep only the merged result.
rm -f "$OUT"/zombie-mesh.glb "$OUT"/zombie-idle.glb "$OUT"/zombie-run.glb "$OUT"/zombie-jump.glb

echo "wrote $OUT/zombie.glb"
ls -la "$OUT/zombie.glb"
