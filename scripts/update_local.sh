#!/bin/bash
# Daily data refresh, run on the Mac mini (launchd). Not a GitHub Action because
# snapshot.mjs reads 立委觀測站's API on 127.0.0.1:8787, and county-stats.mjs hits
# government sites that may block cloud IPs. Pushes only when the data changed;
# the push triggers .github/workflows/pages.yml, which deploys.
#
#   ./scripts/update_local.sh             # run once now
#   ./scripts/update_local.sh --install   # schedule daily 10:30 with launchd
#   ./scripts/update_local.sh --uninstall
set -euo pipefail
cd "$(dirname "$0")/.."

LABEL="com.$(whoami).tw-county-map-update"
PLIST="$HOME/Library/LaunchAgents/$LABEL.plist"
LOG="$HOME/Library/Logs/tw-county-map-update.log"

if [[ "${1:-}" == "--install" ]]; then
    # Homebrew paths listed too: an ssh session's PATH usually lacks them
    for node in $(which -a node 2>/dev/null) /opt/homebrew/bin/node /usr/local/bin/node; do
        [[ -x "$node" ]] && { NODEDIR="$(dirname "$node")"; break; }
    done
    [[ -n "${NODEDIR:-}" ]] || { echo "node not found"; exit 1; }
    [[ -x "$NODEDIR/pdftotext" ]] || command -v pdftotext >/dev/null || { echo "pdftotext missing (brew install poppler)"; exit 1; }
    cat > "$PLIST" <<PLIST
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key><string>$LABEL</string>
    <key>ProgramArguments</key><array><string>$PWD/scripts/update_local.sh</string></array>
    <key>EnvironmentVariables</key><dict><key>PATH</key><string>$NODEDIR:/opt/homebrew/bin:/usr/bin:/bin:/usr/sbin:/sbin</string></dict>
    <!-- Daily 10:30; a run missed while asleep happens on wake -->
    <key>StartCalendarInterval</key><dict><key>Hour</key><integer>10</integer><key>Minute</key><integer>30</integer></dict>
    <key>StandardOutPath</key><string>$LOG</string>
    <key>StandardErrorPath</key><string>$LOG</string>
</dict>
</plist>
PLIST
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    launchctl bootstrap "gui/$(id -u)" "$PLIST"
    echo "Installed $PLIST (node: $NODEDIR/node, log: $LOG)"
    exit 0
fi
if [[ "${1:-}" == "--uninstall" ]]; then
    launchctl bootout "gui/$(id -u)/$LABEL" 2>/dev/null || true
    rm -f "$PLIST"
    echo "Removed $LABEL"
    exit 0
fi

notify() { osascript -e "display notification \"$1\" with title \"縣市地圖資料更新\"" 2>/dev/null || true; }
trap 'notify "更新失敗，請看 ~/Library/Logs/tw-county-map-update.log"' ERR

echo "=== $(date '+%F %T') ==="
# Never touch work in progress
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Working tree has uncommitted changes; skipping this run."
    notify "略過：專案有未提交的修改"
    exit 0
fi

git pull -q --ff-only
# Reinstall only when the lockfile changed since the last install
if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
    npm ci --silent --no-audit --no-fund
fi

node scripts/snapshot.mjs
# 16 government sites: one bad day should not block the election snapshot
if ! node scripts/county-stats.mjs; then
    echo "county-stats.mjs failed; keeping the previous county-stats / county-trends."
    git checkout -q -- public/data/county-stats.json public/data/county-trends.json
    notify "醫療、房價等統計今天抓取失敗，沿用舊資料"
fi

npm run build --silent  # a broken snapshot must not reach the site
git checkout -q -- tsconfig.tsbuildinfo 2>/dev/null || true

# Every API response carries meta.generated_at / meta.fetched_at, so each run
# rewrites every file; put back the ones whose content did not really change
node -e '
const { execFileSync } = require("node:child_process");
const { readFileSync } = require("node:fs");
const strip = (text) => {
    const data = JSON.parse(text);
    if (data && data.meta) { delete data.meta.generated_at; delete data.meta.fetched_at; }
    return JSON.stringify(data);
};
const changed = execFileSync("git", ["diff", "--name-only", "-z", "--", "public/data"]).toString()
    .split("\0").filter((f) => f && f !== "public/data/_snapshot.json");
for (const file of changed) {
    const before = execFileSync("git", ["show", `HEAD:${file}`], { maxBuffer: 1 << 28 }).toString();
    if (strip(before) === strip(readFileSync(file, "utf8"))) execFileSync("git", ["checkout", "-q", "--", file]);
}'

git add public/data
if git diff --cached --quiet -- public/data ':(exclude)public/data/_snapshot.json'; then
    echo "資料沒有變動。"
    git reset -q && git checkout -q -- public/data  # drop the timestamp-only change
    exit 0
fi
git diff --cached --stat -- public/data
git commit -q -m "資料自動更新（Mac mini）$(date +%F)"
git push -q
notify "資料有更新，已推送並部署"
echo "Pushed."
