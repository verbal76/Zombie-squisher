#!/usr/bin/env bash
# Release tag provenance.
#   tag-release.sh <tag> <sha>           create the tag on <sha> (refuses an existing tag that points elsewhere)
#   tag-release.sh --check <tag> <sha>   fail unless the REMOTE tag resolves to <sha> (peeling annotated tags)
# Needs: a checkout of <sha> with push rights for create mode. GitHub's release API silently uses the default
# branch head when a tag does not exist and no target is given; this script removes that dependence.
set -euo pipefail
MODE=create
if [ "${1:-}" = "--check" ]; then MODE=check; shift; fi
TAG="${1:?tag}"; SHA="${2:?sha}"
case "$SHA" in [0-9a-f]*) [ ${#SHA} -eq 40 ] || { echo "::error::SHA must be 40 hex chars"; exit 2; } ;; *) echo "::error::bad SHA"; exit 2 ;; esac

remote_target() { # prints the commit the remote tag resolves to (empty if absent)
  local out; out=$(git ls-remote origin "refs/tags/$TAG" "refs/tags/$TAG^{}" | awk '{print $1" "$2}')
  echo "$out" | awk -v t="refs/tags/$TAG" '$2==t"^{}"{p=$1} $2==t{d=$1} END{print (p?p:d)}'
}

if [ "$MODE" = check ]; then
  got=$(remote_target)
  [ "$got" = "$SHA" ] || { echo "::error::release tag $TAG resolves to '${got:-nothing}', expected built commit $SHA"; exit 1; }
  echo "tag $TAG -> $SHA verified"; exit 0
fi

existing=$(remote_target)
if [ -n "$existing" ]; then
  [ "$existing" = "$SHA" ] && { echo "tag $TAG already on $SHA"; exit 0; }
  echo "::error::tag $TAG already exists on $existing, not $SHA; refusing to move a release tag"; exit 1
fi
[ "$(git rev-parse HEAD)" = "$SHA" ] || { echo "::error::checked-out HEAD is not $SHA"; exit 1; }
git tag "$TAG" "$SHA"
git push origin "refs/tags/$TAG"
