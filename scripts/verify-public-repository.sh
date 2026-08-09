#!/usr/bin/env bash

# Verify the files a fresh public repository would contain. This copies the
# current worktree (including ignored local files), initializes a new Git
# repository, and relies on this repository's ignore rules at first add.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
check_dir="$(mktemp -d)"
trap 'rm -rf "$check_dir"' EXIT

tar -C "$repo_root" --exclude=.git -cf - . | tar -C "$check_dir" -xf -

# Exercise every ignored artifact pattern even when a developer has none
# locally. The assertions below must prove the ignore rules, not reflect this
# checkout's incidental local state.
mkdir -p \
	"$check_dir/.firebase" \
	"$check_dir/android/app" \
	"$check_dir/functions" \
	"$check_dir/scripts/tutorials" \
	"$check_dir/static/.well-known"
touch \
	"$check_dir/.env" \
	"$check_dir/.env.local" \
	"$check_dir/.firebaserc" \
	"$check_dir/.firebase/hosting.YnVpbGQ.cache" \
	"$check_dir/android/app/google-services.json" \
	"$check_dir/android/keystore.properties" \
	"$check_dir/android/local.properties" \
	"$check_dir/android/release.jks" \
	"$check_dir/android/release.keystore" \
	"$check_dir/capacitor.config.ts" \
	"$check_dir/functions/.env" \
	"$check_dir/play-service-account.json" \
	"$check_dir/playwright.tutorials.config.ts" \
	"$check_dir/scripts/tutorials/.storage-state.json" \
	"$check_dir/static/.well-known/assetlinks.json"

git -C "$check_dir" init --quiet
git -C "$check_dir" add --all

assert_tracked() {
	if ! git -C "$check_dir" ls-files --error-unmatch -- "$1" >/dev/null 2>&1; then
		echo "Expected public repository to include: $1" >&2
		exit 1
	fi
}

assert_excluded() {
	if git -C "$check_dir" ls-files --error-unmatch -- "$1" >/dev/null 2>&1; then
		echo "Expected public repository to exclude: $1" >&2
		exit 1
	fi
}

assert_no_production_identity() {
	local encoded_identity identity matches file
	local -a public_runtime_files=()
	while IFS= read -r -d '' file; do
		case "$file" in
			# LICENSE is legal attribution. Every other publishable file, including
			# tests and verifier scripts, must be fork-safe.
			LICENSE) continue ;;
		esac
		public_runtime_files+=("$file")
	done < <(git -C "$check_dir" ls-files -z)

	for encoded_identity in "$@"; do
		identity="$(printf '%s' "$encoded_identity" | base64 --decode)"
		matches="$(git -C "$check_dir" grep -n -I -i -F -- "$identity" -- "${public_runtime_files[@]}" || true)"
		if [[ -n "$matches" ]]; then
			echo "Production identity found in public repository: $matches" >&2
			exit 1
		fi
	done
}

assert_tracked android/app/src/main/java/com/geotracker/app/GpsTrackerPlugin.java
assert_tracked android/build.gradle
assert_tracked android/gradlew
assert_tracked android/settings.gradle
assert_tracked .env.example
assert_tracked .firebaserc.example
assert_tracked capacitor.config.ts.example
assert_tracked functions/.env.example
assert_tracked functions/tsconfig.json
assert_tracked docs/index.md
assert_tracked scripts/verify-public-repository.sh
assert_tracked static/.well-known/assetlinks.json.example
assert_tracked storage.lifecycle.json

assert_excluded .env
assert_excluded .env.local
assert_excluded functions/.env
assert_excluded .firebaserc
assert_excluded .firebase/hosting.YnVpbGQ.cache
assert_excluded android/app/google-services.json
assert_excluded android/keystore.properties
assert_excluded android/local.properties
assert_excluded android/release.jks
assert_excluded android/release.keystore
assert_excluded capacitor.config.ts
assert_excluded play-service-account.json
assert_excluded playwright.tutorials.config.ts
assert_excluded scripts/tutorials/.storage-state.json
assert_excluded static/.well-known/assetlinks.json

# This scans every publishable file, including README, docs, tests, and scripts.
# Legal attribution remains in LICENSE.
# Encoded values prevent this verifier from becoming a production identity leak.
assert_no_production_identity \
	YW1hbGFzcGFjZS5jb20= \
	YW1hbGEtZ2VvLXRyYWNrZXI= \
	Y29tLmFtYWxhc3BhY2UuZ2VvbmVzdA== \
	c3VwcG9ydEBhbWFsYXNwYWNlLmNvbQ== \
	QW1hbGEgU3BhY2U=

echo "Public repository boundary check passed."
