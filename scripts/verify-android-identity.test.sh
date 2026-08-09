#!/usr/bin/env bash

# Regression guard: positive Android identity assertions must inspect the
# fresh public-repository fixture, not the private checkout.
set -euo pipefail

script='scripts/verify-android-identity.sh'
contents="$(<"$script")"

if [[ "$contents" != *'git -C "$public_repo" show ":$file"'* ]]; then
	echo "Expected identity assertions to read staged fixture content" >&2
	exit 1
fi

if [[ "$contents" != *'git -C "$public_repo" ls-files --error-unmatch -- "$file"'* ]]; then
	echo "Expected identity assertions to assert fixture paths are tracked" >&2
	exit 1
fi
