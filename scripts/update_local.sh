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

# Telegram through this machine's Hermes (its home channel); macOS banner if that fails
TITLE="縣市地圖資料更新"
HERMES="${HERMES:-$HOME/.hermes/hermes-agent/.hermes/bin/hermes}"
notify() {
    [[ -x "$HERMES" ]] && "$HERMES" send -q -t telegram -s "$TITLE" "$1" 2>/dev/null && return
    osascript -e "display notification \"${1//\"/\'}\" with title \"$TITLE\"" 2>/dev/null || true
}
trap 'notify "❌ 更新失敗：$BASH_COMMAND（第 $LINENO 行）。紀錄：$LOG"' ERR

# Heartbeat for the GitHub watchdog (LawsGraphify/.github/workflows/watchdog.yml): every run
# force-pushes a one-commit "heartbeat" branch with its result, so silence
# (machine off, offline, job not loaded) gets noticed. Never touches main.
STATUS="fail"
heartbeat() {
    local blob tree commit
    blob=$(printf 'status=%s\ntime=%s\nhost=%s\n' "$STATUS" "$(date '+%F %T %z')" "$(hostname -s)" | git hash-object -w --stdin)
    tree=$(printf '100644 blob %s\theartbeat.txt\n' "$blob" | git mktree)
    commit=$(GIT_AUTHOR_NAME=heartbeat GIT_AUTHOR_EMAIL=heartbeat@localhost \
             GIT_COMMITTER_NAME=heartbeat GIT_COMMITTER_EMAIL=heartbeat@localhost \
             git commit-tree "$tree" -m "heartbeat: $STATUS")
    git push -q -f origin "$commit:refs/heads/heartbeat" || echo "heartbeat push failed"
}
trap heartbeat EXIT

echo "=== $(date '+%F %T') ==="
# Never touch work in progress
if ! git diff --quiet || ! git diff --cached --quiet; then
    echo "Working tree has uncommitted changes; skipping this run."
    notify "⏭️ 略過：專案有未提交的修改"
    STATUS="skipped"
    exit 0
fi

git pull -q --ff-only
# Reinstall only when the lockfile changed since the last install
if [[ ! -d node_modules || package-lock.json -nt node_modules/.package-lock.json ]]; then
    npm ci --silent --no-audit --no-fund
fi

node scripts/snapshot.mjs
# 16 government sites: one bad day should not block the election snapshot.
# 2026-10-23：教育部統計處連線逾時，整份 80 個指標沿用舊檔。抖一下就整天不更新太虧，
# 所以失敗先等 5 分鐘再試一次（腳本內部已有逐請求 3 次重試，這一層擋的是「對方主機短暫維修」）。
if ! node scripts/county-stats.mjs; then
    echo "county-stats.mjs failed once; retrying in 5 minutes..."
    sleep 300
    if ! node scripts/county-stats.mjs; then
        echo "county-stats.mjs failed twice; keeping the previous county-stats / county-trends."
        git checkout -q -- public/data/county-stats.json public/data/county-trends.json
        # 通知要能直接看出是哪個來源壞了，不然還要自己去翻 log
        REASON="$(grep -aoE 'attempted address: [^,)]+|\{fetch\} [^ ]+ 第 [0-9]+/[0-9]+ 次失敗' "$LOG" 2>/dev/null | tail -1)"
        notify "⚠️ county-stats.mjs 連兩次失敗${REASON:+（$REASON）}，醫療、房價等統計沿用舊資料；選舉快照照常更新。紀錄：$LOG"
    else
        echo "county-stats.mjs succeeded on the second attempt."
        notify "✅ county-stats.mjs 第一次失敗、重試後成功（資料已更新）"
    fi
fi
# 有來源改用快取時還是要更新（其他來源是新的），但不能安靜地當成全部都是新的
STALE_LINE="$(grep -a '^\[stale\] [0-9]' "$LOG" 2>/dev/null | tail -1 || true)"
if [[ -n "$STALE_LINE" ]]; then
    notify "⚠️ 縣市統計有來源抓不到，已改用該來源的快取（其他來源照常更新）：${STALE_LINE#\[stale\] }"
fi
# 來源整個壞掉時指標不會消失（runner 沿用上一版），但一定要講是哪一個
FAILED="$(grep -a '失敗：' "$LOG" 2>/dev/null | sed 's/^\[source\] //' | tr '\n' '、' || true)"
CARRIED_LINE="$(grep -a '^\[carried\] [0-9]' "$LOG" 2>/dev/null | tail -1 || true)"
if [[ -n "$FAILED" ]]; then
    notify "⚠️ 縣市統計有來源失敗：${FAILED%、}${CARRIED_LINE:+（${CARRIED_LINE#\[carried\] }）}。其他來源照常更新，紀錄：$LOG"
fi

# 解析器測試：紅了不代表資料壞，但代表上游格式變了 —— 要讓我知道，不要安靜地過去
if ! npm test --silent >/dev/null 2>&1; then
    TEST_FAIL="$(npm test --silent 2>&1 | grep -E '^✖|not ok' | head -3 | tr '\n' '；')"
    notify "⚠️ 縣市統計的解析器測試沒過（資料照常更新）：${TEST_FAIL:-npm test 詳見紀錄}"
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
    STATUS="ok"
    exit 0
fi
CHANGED="$(git diff --cached --name-only -- public/data ':(exclude)public/data/_snapshot.json' | sed 's|.*/||; s|\.json$||' | paste -sd '、' -)"
git diff --cached --stat -- public/data
git commit -q -m "資料自動更新（Mac mini）$(date +%F)"
git push -q
notify "✅ 資料有更新，已推送並部署：$CHANGED"
STATUS="ok"
echo "Pushed."
