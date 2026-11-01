#!/usr/bin/env bash
# Manual alternative to Pages on the private source repository.
# Only built static files enter the public repository; this script exports no API.
set -euo pipefail

public_repo="${1:-larok00/read-aloud-plus}"
export BASE_URL="${BASE_URL:-https://larok00.github.io/read-aloud-plus}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
addin_dir="$(cd -- "$script_dir/.." && pwd)"

printf 'Build %s with BASE_URL=%s\n' "$addin_dir" "$BASE_URL"
printf 'Publish only addin/dist to https://github.com/%s branch gh-pages.\n' "$public_repo"
printf 'This creates a public static snapshot commit and pushes it (no force push).\n'
if [[ "${CONFIRM:-}" != yes ]]; then
  printf 'Refusing to build or push: set CONFIRM=yes to run this manual publisher.\n' >&2
  exit 1
fi
if [[ ! "$public_repo" =~ ^[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$ ]]; then
  printf 'Repository must be owner/name.\n' >&2
  exit 1
fi

# Build before creating the isolated publishing checkout; leave source git untouched.
cd -- "$addin_dir"
npm ci
npm test
npm run build
publish_dir="$(mktemp -d)"
trap 'rm -rf -- "$publish_dir"' EXIT
remote_url="https://github.com/${public_repo}.git"
git -C "$publish_dir" init --quiet
git -C "$publish_dir" remote add origin "$remote_url"
# A failed query is an error, not evidence that the branch is absent.
remote_branch="$(git -C "$publish_dir" ls-remote --heads origin refs/heads/gh-pages)"
if [[ -n "$remote_branch" ]]; then
  git -C "$publish_dir" fetch --depth=1 origin gh-pages
  git -C "$publish_dir" checkout -b gh-pages FETCH_HEAD
else
  git -C "$publish_dir" checkout --orphan gh-pages
fi
# Replace the static snapshot, preserving only git metadata.
find "$publish_dir" -mindepth 1 -maxdepth 1 ! -name .git -exec rm -rf -- {} +
cp -R "$addin_dir/dist/." "$publish_dir/"
touch "$publish_dir/.nojekyll"
git -C "$publish_dir" add --all
if git -C "$publish_dir" diff --cached --quiet; then
  printf 'No static-file changes to publish.\n'
  exit 0
fi
git -C "$publish_dir" commit -m 'Publish Read Aloud+ static files'
git -C "$publish_dir" push origin HEAD:gh-pages
