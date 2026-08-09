#!/usr/bin/env bash

# Verify that Android source is fork-safe: deployment identity is supplied by
# local/CI configuration and never hard-coded to the production application.
set -euo pipefail

repo_root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$repo_root"

public_repo="$(mktemp -d)"
trap 'rm -rf "$public_repo"' EXIT

# Match the first `git add` in the planned fresh public repository. This is
# deliberately not a checkout of the current private Git index: it must prove
# ignored Firebase configuration does not enter the publishable repository.
tar -C "$repo_root" --exclude=.git -cf - . | tar -C "$public_repo" -xf -
git -C "$public_repo" init --quiet
git -C "$public_repo" add --all

fail() {
	echo "$1" >&2
	exit 1
}

assert_public_tracked() {
	local file="$1"
	if ! git -C "$public_repo" ls-files --error-unmatch -- "$file" >/dev/null 2>&1; then
		fail "Expected public Android repository to include: $file"
	fi
}

assert_contains() {
	local file="$1"
	local value="$2"
	local contents
	assert_public_tracked "$file"
	contents="$(git -C "$public_repo" show ":$file")"
	if [[ "$contents" != *"$value"* ]]; then
		fail "Expected $file to contain: $value"
	fi
}

assert_public_identity_absent() {
	local value="$1"
	local matches
	matches="$(git -C "$public_repo" grep -n -F -e "$value" -- android capacitor.config.ts.example .env.example || true)"
	if [[ -n "$matches" ]]; then
		fail "Production identity found in public Android source/config: $matches"
	fi
}

# Encoded regression values keep this public verifier from becoming an identity
# leak while it guards against the original deployment configuration.
assert_public_identity_absent "$(printf '%s' 'Y29tLmFtYWxhc3BhY2UuZ2VvbmVzdA==' | base64 --decode)"
assert_public_identity_absent "$(printf '%s' 'YW1hbGFzcGFjZS5jb20=' | base64 --decode)"

assert_contains android/app/build.gradle 'PUBLIC_ANDROID_APP_ID'
assert_contains android/app/build.gradle 'PUBLIC_ANDROID_DEEP_LINK_HOST'
assert_contains android/app/build.gradle 'PUBLIC_ANDROID_DEEP_LINK_PATH_PREFIX'
assert_contains android/app/build.gradle "manifestPlaceholders"
assert_contains android/app/build.gradle "'com.example.geonest'"
assert_contains android/app/build.gradle "'example.com'"
assert_contains android/app/src/main/AndroidManifest.xml 'android:host="${appLinkHost}"'
assert_contains android/app/src/main/AndroidManifest.xml 'android:pathPrefix="${appLinkPathPrefix}"'
assert_contains .env.example 'PUBLIC_ANDROID_DEEP_LINK_HOST=example.com'
assert_contains .env.example 'PUBLIC_ANDROID_DEEP_LINK_PATH_PREFIX=/geonest/join/'
assert_contains .env.example '-PandroidAppId/-PandroidDeepLinkHost/-PandroidDeepLinkPathPrefix > PUBLIC_ANDROID_* environment > root .env > neutral defaults'

echo "Android identity check passed."
