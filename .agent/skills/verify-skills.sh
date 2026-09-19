#!/usr/bin/env bash
# Citation gate for .agent/skills/*/SKILL.md
#
# A skill is documentation an agent acts on without checking, so every concrete
# claim it makes has to resolve: a local path must exist in the tree, an npm
# script must be defined in package.json, a named sibling skill must exist, and
# a payload field must carry the canonical runtime's name rather than a fork's
# drifted one.
#
# Conventions this enforces:
#   * Paths are cited `repo:path`. An unprefixed path is local and must exist.
#     A prefixed one (`lydia:src/...`) is another repo's and is not checked here.
#   * A skill describing tooling that is not built yet declares itself with
#         <!-- verify-skills: aspirational-scripts -->
#     and is then exempt from the npm-script check. Use it only alongside a
#     visible status note; it is not a way to keep a stale command list.
#
# Run from the repo root:  bash .agent/skills/verify-skills.sh
set -uo pipefail
cd "$(git rev-parse --show-toplevel)"

fail=0
bad() { printf 'FAIL  %s\n' "$1"; fail=1; }

skills=$(find .agent/skills -name SKILL.md | sort)
skill_dirs=$(find .agent/skills -mindepth 1 -maxdepth 1 -type d -printf '%f\n' | sort)
# Template and widget directory names collide with skill naming (`default-template`),
# so they are excluded from the sibling-skill check rather than reported.
not_skills=$( { ls src/templates 2>/dev/null; ls src/widgets 2>/dev/null; } | sort -u)

echo "== 1. every local path resolves (repo-prefixed paths are cross-repo, skipped)"
for f in $skills; do
  while read -r p; do
    [ -n "$p" ] || continue
    case "$p" in *my-template*|*'<'*) continue;; esac                 # illustrative
    grep -q "[A-Za-z0-9_-]:$p" "$f" && continue                       # repo:path, cross-repo
    [ -e "$p" ] || bad "$f cites missing local path: $p"
  done < <(grep -hoE '(^|[^:A-Za-z0-9_-])(src|scripts|tests|schemas)/[A-Za-z0-9_./-]+' "$f" \
             | grep -oE '(src|scripts|tests|schemas)/[A-Za-z0-9_./-]+' | sort -u)
done

echo "== 2. every npm script referenced is defined"
defined=$(jq -r '.scripts|keys[]' package.json | sort)
for f in $skills; do
  grep -q 'verify-skills: aspirational-scripts' "$f" && continue
  while read -r s; do
    [ -n "$s" ] || continue
    grep -qx "$s" <<<"$defined" || bad "$f tells you to run an undefined script: npm run $s"
  done < <(grep -hoE 'npm run [a-z:-]+' "$f" | awk '{print $3}' | sort -u)
done

echo "== 3. every sibling skill named actually exists"
for f in $skills; do
  own=$(basename "$(dirname "$f")")
  while read -r s; do
    [ -n "$s" ] || continue
    [ "$s" = "$own" ] && continue
    grep -qx "$s" <<<"$not_skills" && continue
    grep -qx "$s" <<<"$skill_dirs" || bad "$f names a nonexistent skill: $s"
  done < <(grep -hoE '\.agent/skills/[a-z0-9-]+|`[a-z][a-z0-9]+(-[a-z0-9]+)+`' "$f" \
             | sed 's|.*\.agent/skills/||' | tr -d '`' \
             | grep -E -- '-(template|tests|mapping|check|build|codebase|testing|contract)$' | sort -u)
done

echo "== 4. canonical payload field names — fork drift must not be taught"
for f in $skills; do
  while read -r l; do bad "$f teaches a fork-drifted field name: $l"; done \
    < <(grep -nE 'invoice\.(igst|utgst)\b' "$f")
done

echo "== 5. un-extracted render tooling must not be referenced"
for f in $skills; do
  while read -r l; do bad "$f references un-extracted render tooling: $l"; done \
    < <(grep -nE 'render-check|npm run render|scripts/render(Lint)?\.mjs|\.ceres-render' "$f")
done

echo "== 6. frontmatter shape and name/directory agreement"
for f in $skills; do
  head -1 "$f" | grep -qx -- '---' || bad "$f has no opening frontmatter fence"
  grep -qE '^description: ' "$f" || bad "$f has no description:"
  n=$(grep -E '^name: ' "$f" | head -1 | sed 's/^name: *//')
  d=$(basename "$(dirname "$f")")
  [ -n "$n" ] || bad "$f has no name:"
  [ -z "$n" ] || [ "$n" = "$d" ] || bad "$f declares name: '$n' but sits in '$d'"
done

echo
if [ "$fail" -eq 0 ]; then echo "OK: skills verified"; else echo "skills verification FAILED"; fi
exit "$fail"
