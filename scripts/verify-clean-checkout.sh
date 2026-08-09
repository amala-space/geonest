#!/usr/bin/env bash

# Reconstruct the public repository from this worktree, then exercise the same
# web commands contributors and CI use. This prevents ignored generated files
# from masking a missing build input in a long-lived checkout.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
staging_dir="$(mktemp -d)"
checkout_dir="$(mktemp -d)"
trap 'rm -rf "$staging_dir" "$checkout_dir"' EXIT

# A first add applies the current ignore rules; git archive then makes the
# second directory equivalent to a clean checkout of that public tree.
tar -C "$repo_root" --exclude=.git -cf - . | tar -C "$staging_dir" -xf -
git -C "$staging_dir" init --quiet
git -C "$staging_dir" add --all
tree="$(git -C "$staging_dir" write-tree)"
git -C "$staging_dir" archive "$tree" | tar -C "$checkout_dir" -xf -

cd "$checkout_dir"
npm ci
cp .env.example .env
npm run check
npm test
npm run build 2>&1 | tee build.log
if grep -Fq 'auth/invalid-api-key' build.log; then
	echo 'Clean checkout prerendered with an invalid Firebase API key.' >&2
	exit 1
fi
