#!/usr/bin/env bash

# Rewrite a fresh clone or mirror so the generated/private paths listed below
# are absent from every reachable ref. This script deliberately does not
# accept --force for git-filter-repo and never pushes the rewritten refs.

set -Eeuo pipefail

SCRIPT_ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd -P)"
CURRENT_ROOT="$(git -C "$SCRIPT_ROOT" rev-parse --show-toplevel 2>/dev/null || true)"
CURRENT_GIT_DIR="$(git -C "$SCRIPT_ROOT" rev-parse --absolute-git-dir 2>/dev/null || true)"
readonly SCRIPT_ROOT CURRENT_ROOT CURRENT_GIT_DIR

readonly -a PATHS_TO_REMOVE=(
  "examples/sandbox-next/.next"
  "docs/qa/screenshots"
  ".codex/config.toml"
)

usage() {
  cat <<'EOF'
Usage:
  scripts/sanitize-history.sh FRESH_CLONE_OR_MIRROR

Rewrite the explicitly supplied, disposable clone or mirror with
git-filter-repo. The rewrite removes these exact paths from all reachable
refs, expires reflogs, and prunes unreachable objects:

  examples/sandbox-next/.next
  docs/qa/screenshots
  .codex/config.toml

The target must be a clean fresh clone or a bare mirror outside this checkout.
The script never uses --force, never pushes, and never rewrites the checkout
that contains this script. git-filter-repo is a prerequisite; install it with
Homebrew (brew install git-filter-repo) or Python (python3 -m pip install
git-filter-repo) before running this helper.

Rewriting changes commit IDs. After inspecting the result, coordinate a
force-push of every affected branch and tag with repository collaborators;
existing clones must be recloned or explicitly reset. A force-push is
intentionally left to the operator and is not performed by this script.
EOF
}

die() {
  printf 'error: %s\n' "$*" >&2
  exit 1
}

is_same_or_below() {
  local child="$1"
  local parent="$2"

  [[ "$child" == "$parent" || "$child" == "$parent"/* ]]
}

if [[ "$#" -eq 1 && ( "$1" == "--help" || "$1" == "-h" ) ]]; then
  usage
  exit 0
fi

if [[ "$#" -ne 1 ]]; then
  usage >&2
  exit 2
fi

if [[ "$1" == -* ]]; then
  die "the target must be an explicit repository path, not an option"
fi

target="$(realpath "$1" 2>/dev/null)" || die "target does not exist: $1"
[[ -d "$target" ]] || die "target is not a directory: $target"
[[ "$target" != "/" ]] || die "refusing filesystem root as the target"

inside_work_tree="$(git -C "$target" rev-parse --is-inside-work-tree 2>/dev/null || true)"
is_bare="$(git -C "$target" rev-parse --is-bare-repository 2>/dev/null || true)"
[[ "$inside_work_tree" == true || "$is_bare" == true ]] || die \
  "target is not a Git worktree or bare repository: $target"

target_git_dir="$(git -C "$target" rev-parse --absolute-git-dir 2>/dev/null || true)"
[[ -n "$target_git_dir" ]] || die "could not resolve the target Git directory: $target"
target_git_dir="$(realpath "$target_git_dir" 2>/dev/null)" || die \
  "target Git directory does not exist: $target_git_dir"

current_root=""
if [[ -n "$CURRENT_ROOT" ]]; then
  current_root="$(realpath "$CURRENT_ROOT" 2>/dev/null || true)"
fi
current_git_dir=""
if [[ -n "$CURRENT_GIT_DIR" ]]; then
  current_git_dir="$(realpath "$CURRENT_GIT_DIR" 2>/dev/null || true)"
fi

if [[ -n "$current_root" ]] && is_same_or_below "$target" "$current_root"; then
  die "refusing the checkout that contains this script or a path inside it: $target"
fi
if [[ -n "$current_root" ]] && is_same_or_below "$current_root" "$target"; then
  die "refusing a target that contains this checkout: $target"
fi
if [[ -n "$current_git_dir" && "$target_git_dir" == "$current_git_dir" ]]; then
  die "refusing a repository that shares this checkout's Git directory: $target"
fi

if [[ "$is_bare" == true ]]; then
  [[ "$target_git_dir" == "$target" ]] || die \
    "a bare target must be the mirror's repository root: $target"
else
  target_root="$(git -C "$target" rev-parse --show-toplevel 2>/dev/null || true)"
  [[ -n "$target_root" ]] || die "could not resolve the target worktree root: $target"
  target_root="$(realpath "$target_root" 2>/dev/null)" || die \
    "target worktree root does not exist: $target_root"
  [[ "$target_root" == "$target" ]] || die \
    "pass the fresh clone's worktree root, not a subdirectory: $target"

  status_output="$(git -C "$target" status --porcelain=v1 --untracked-files=all)" || die \
    "could not inspect target worktree status: $target"
  [[ -z "$status_output" ]] || die \
    "target worktree is not clean; use a fresh clone or bare mirror: $target"
fi

for operation_marker in \
  "$target_git_dir/MERGE_HEAD" \
  "$target_git_dir/CHERRY_PICK_HEAD" \
  "$target_git_dir/REVERT_HEAD" \
  "$target_git_dir/BISECT_LOG" \
  "$target_git_dir/rebase-apply" \
  "$target_git_dir/rebase-merge"; do
  [[ ! -e "$operation_marker" ]] || die \
    "target has an in-progress Git operation; finish or discard it first: $operation_marker"
done

filter_repo="$(command -v git-filter-repo 2>/dev/null || true)"
[[ -n "$filter_repo" ]] || die \
  "git-filter-repo is required; install it with 'brew install git-filter-repo' or 'python3 -m pip install git-filter-repo'"

filter_version="$("$filter_repo" --version 2>/dev/null || true)"
[[ -n "$filter_version" ]] || die "git-filter-repo could not be executed: $filter_repo"

ref_count="$(git -C "$target" for-each-ref --format='%(refname)' | awk 'END { print NR + 0 }')"
target_kind="working clone"
[[ "$is_bare" == true ]] && target_kind="bare mirror"
printf 'Sanitizing %s (%s; %s refs)\n' "$target" "$target_kind" "$ref_count"
printf 'Using git-filter-repo %s\n' "$filter_version"
printf 'Removing exact paths:\n'
for path in "${PATHS_TO_REMOVE[@]}"; do
  printf '  %s\n' "$path"
done

(
  cd -- "$target"

  # No --refs is intentional: git-filter-repo's default processes all refs.
  "$filter_repo" \
    --invert-paths \
    --path "${PATHS_TO_REMOVE[0]}" \
    --path "${PATHS_TO_REMOVE[1]}" \
    --path "${PATHS_TO_REMOVE[2]}"
)

remaining_paths() {
  git -C "$target" rev-list --objects --all |
    awk '
      {
        path = $0
        sub(/^[^ ]+ /, "", path)
        if (path == ".codex/config.toml" ||
            index(path, "examples/sandbox-next/.next/") == 1 ||
            index(path, "docs/qa/screenshots/") == 1) {
          print path
        }
      }
    '
}

remaining="$(remaining_paths)" || die "could not verify rewritten refs"
[[ -z "$remaining" ]] || {
  printf 'error: removed paths remain reachable after rewriting:\n%s\n' "$remaining" >&2
  exit 1
}

printf 'All removed paths are absent from reachable refs; expiring reflogs and pruning objects\n'
git -C "$target" reflog expire --expire=now --all
git -C "$target" gc --prune=now --aggressive

remaining="$(remaining_paths)" || die "could not verify refs after garbage collection"
[[ -z "$remaining" ]] || {
  printf 'error: removed paths remain reachable after garbage collection:\n%s\n' "$remaining" >&2
  exit 1
}

printf 'History rewrite complete. No remote refs were pushed.\n'
printf 'Review the rewritten refs, then coordinate the required force-push separately.\n'
