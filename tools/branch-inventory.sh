#!/usr/bin/env bash
# Read-only: lists every remote branch with its relation to the authoritative line, and the commits that are
# neither reachable nor patch-equivalent ("+" in git cherry). Compare the result with docs/BRANCH_LEDGER.md.
# Usage: tools/branch-inventory.sh [authoritative-ref]   (default origin/Github-build-pipeline-zombie-crusher)
set -euo pipefail
AUTH="${1:-origin/Github-build-pipeline-zombie-crusher}"
git fetch -q --all --tags 2>/dev/null || true
printf '%-58s %7s %7s %10s\n' BRANCH AHEAD BEHIND UNIQUE
git for-each-ref --format='%(refname:short)' refs/remotes | grep -v '/HEAD$' | while read -r b; do
  [ "$b" = "$AUTH" ] && continue
  ahead=$(git rev-list --count "$AUTH..$b"); behind=$(git rev-list --count "$b..$AUTH")
  uniq=$(git cherry "$AUTH" "$b" | grep -c '^+' || true)
  printf '%-58s %7s %7s %10s\n' "$b" "$ahead" "$behind" "$uniq"
done
