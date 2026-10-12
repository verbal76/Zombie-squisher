# Branch recovery ledger

Audit date 2026-10-12. Method: ancestry (`merge-base`, `--is-ancestor`), patch equivalence (`git cherry`), file
and content comparison of the code each commit touches. Regenerate the numbers with `tools/branch-inventory.sh`.
Nothing here was deleted, rewritten or force-pushed. **Every branch listed stays.**

## Authoritative line

| Role | Ref | SHA |
|---|---|---|
| Release line (what `android-build.yml` and `eas-update.yml` build; shipped build #76 = run 76 = this commit) | `Github-build-pipeline-zombie-crusher` | `7004f7d` |
| Rollback checkpoint (same commit, immutable by convention) | `checkpoint/pre-resurrection-7004f7d` | `7004f7d` |
| Working branch (PR #1, 28 commits ahead, 0 behind; contains the release line, `main` and the scratch archive) | `ccr-27903f19-fy49jb` | see `git rev-parse` |

`main` is the GitHub default branch but is **not** a product line: 158 commits behind the release line, it holds only
a README rename, a prune workflow and the HAG logo upload.

## Ledger

| Branch | Commit | What | Class | Disposition |
|---|---|---|---|---|
| `claude/fix-bounding-box-controls-7LQLQ` | `b937e5c` Driving overhaul P1-P5 | engine/controls | Integrated (patch-equivalent in release line as `0c4c1c0`) | none |
| | `db8b9e3` Wire vehicle GLBs, `loadVehicle` | 3D car model | Integrated (patch-equivalent) | none |
| | `afa14fa` Remove camera lookahead | camera | Superseded: release line replaced the top-down camera with a chase cam (`0c2b974`) | none |
| | `4f454c3` Bicycle-model steering | steering | Superseded: release line already had its own bicycle model (`b220858`), then deliberately moved on (`84a4d59` Mario-Kart, `00cdfe2` heading-locked, `4647e49` Ocean-Spore physics). Merging would change established driving feel | **do not recover**; keep branch |
| `claude/fix-build-artifacts-visibility-rwXqU` | `a4faef4`, `1ab1c74`, `8347592`, `1d19a5d`, `c74ae56` | docs, pins, expo-file-system dep | Integrated (patch-equivalent) | none |
| | `9058dc4`, `9755d39` quote workflow `name` | YAML `#` fix | Integrated through an equivalent implementation (re-fixed independently, now linted by actionlint in CI) | none |
| | `9f4cd38`, `a564fd8` publish a Release per APK build | release flow | Integrated through an equivalent implementation (`android-build.yml` `release-apk`) | none |
| | `b62c700` only build on the pipeline branch | workflow | Integrated (same rule in `android-build.yml`) | none |
| | `ac525a4`, `0d97f11`, `2346da1`, `24db1cd`, `afce8ea` free-roam 2D, steering wheel, "faux-3D", revert to 2D, restore 3D | May-9 prototype experiments | Superseded / intentionally removed (`bccae06` deleted `SteeringWheel.tsx`; the product is 3D with button controls) | none |
| | `db43078` | three ^0.170 bump | Superseded (project pins three 0.166.1 for R3F 9 / SDK 54) | none |
| `claude/github-game-builds-AAswD` | `dba8096` agentic docs | docs | Integrated (patch-equivalent) | none |
| `main` | `bd10062` rename to "Zombie Crusher" (README only) | naming | Contained in the working branch; **the game name is an open owner decision** (see HANDOFF) | owner decision |
| | `2f8dac0` HAG master logo | brand asset | Integrated (it is the splash source) | none |
| | `1707a6a` prune workflow | CI | Integrated (and trimmed by the Actions budget policy) | none |
| `archive/scratch-rewrite-97a5729` | 7 commits | my first from-scratch rewrite (wrong base) | Superseded; kept as a reference archive. Its tests, audio and UI work were re-applied on the real line | none |

Result: **no completed, valuable work is missing from the release line.** Both unmerged branches
(`fix-bounding-box-controls`, `fix-build-artifacts-visibility`) hold only work that is already integrated, was
replaced on purpose, or was an abandoned experiment. Nothing needed recovering and no owner approval is pending
from this audit.

## Releases and tags

The release tags `apk-build-17 … apk-build-76` do **not** identify the built source. The workflow created each tag
without a target, so GitHub placed it on the default-branch head at that moment: they point at `1b67363`, `214f7ba`,
`bd10062` and `1707a6a` (all `main`), none of which is in the release line.

Authoritative mapping: `apk-build-N` was built by `android-build.yml` **run number N**; that run's `head_sha` is the
source. Example: `apk-build-76` → run 76 → `7004f7d` (verified from the run record). The tags cannot be moved without
rewriting shared references, so they are left and this table is the record. Fixed going forward
(`target_commitish: ${{ github.sha }}`).

## Enforcement added

- `release-apk` runs only for `refs/heads/Github-build-pipeline-zombie-crusher`; a dispatch from any other branch builds
  but cannot publish.
- The store-bundle (AAB) job refuses a commit that is not an ancestor of the pipeline branch.
- Every APK ships `build-manifest.json` (source SHA, ref, version, runtime version, platform, profile, toolchain,
  timestamp, APK SHA-256) and the build fails if the embedded commit differs from `GITHUB_SHA`.
- `tests/provenance.test.ts` (local, no CI cost) asserts these guards and that this ledger lists every remote branch.
- `tools/branch-inventory.sh` shows ahead/behind/unique per branch on demand.
