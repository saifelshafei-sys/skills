#!/usr/bin/env bash
# Copy the installed graphify skill into this plugin and set plugin.json's
# version from the skill's .graphify_version. Safe to run repeatedly.
#
# Usage: graphify/scripts/sync.sh [SKILL_DIR]
#   SKILL_DIR defaults to $GRAPHIFY_SKILL_DIR, then ~/.claude/skills/graphify
#   (where `graphify install` puts the skill).
set -euo pipefail

plugin_dir="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
src="${1:-${GRAPHIFY_SKILL_DIR:-$HOME/.claude/skills/graphify}}"
dest="$plugin_dir/skills/graphify"
manifest="$plugin_dir/.claude-plugin/plugin.json"

command -v graphify >/dev/null || { echo "graphify CLI not found; run: uv tool install graphifyy" >&2; exit 1; }
[ -f "$src/SKILL.md" ] || { echo "no SKILL.md in $src; run: graphify install" >&2; exit 1; }
[ -f "$src/.graphify_version" ] || { echo "no .graphify_version in $src" >&2; exit 1; }

version="$(tr -d '[:space:]' < "$src/.graphify_version")"
cli_version="$(graphify --version | awk '{print $NF}')"
if [ "$cli_version" != "$version" ]; then
  echo "warning: CLI is $cli_version but skill in $src is $version; run 'graphify install' to refresh it" >&2
fi

rm -rf "$dest"
mkdir -p "$dest"
cp "$src/SKILL.md" "$src/.graphify_version" "$dest/"
[ -d "$src/references" ] && cp -R "$src/references" "$dest/"

python3 - "$manifest" "$version" <<'PY'
import json, sys
path, version = sys.argv[1], sys.argv[2]
with open(path) as f:
    data = json.load(f)
data["version"] = version
with open(path, "w") as f:
    json.dump(data, f, indent=2)
    f.write("\n")
PY

echo "synced graphify skill $version from $src"
