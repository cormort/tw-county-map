#!/bin/bash
# 讀 update 的 log，決定「這次要不要發通知」。
#
#   scripts/alert-check.sh <log 檔>
#
# 輸出：每則該發的通知一行，前綴 `NOTIFY: `（update_local.sh 負責真的送出去）。
# 另外對每個 bucket 印一行 `[alert] <bucket>：<閘門結果>` 進 log，方便日後查。
#
# 閘門規則（scripts/lib/alert-gate.mjs）：同一個 bucket 內、同樣的失敗清單連續 N 次才通知；
# 恢復時只在「先前已經吵過」才補一則。狀態檔：~/Library/Logs/tw-county-map-alerts.json
# 環境變數：ALERT_N（門檻，預設 3）、ALERT_STATE（狀態檔路徑）
set -uo pipefail
cd "$(dirname "$0")/.."

LOG="${1:?用法：alert-check.sh <log 檔>}"
ALERT_STATE="${ALERT_STATE:-$HOME/Library/Logs/tw-county-map-alerts.json}"
ALERT_N="${ALERT_N:-3}"

gate() {
    node scripts/alert-gate.mjs strike "$1" "$2" --threshold "$ALERT_N" --state "$ALERT_STATE" 2>/dev/null \
        || echo "SHOULD_NOTIFY 閘門本身出錯（保守起見照發）"
}
clear_gate() {
    node scripts/alert-gate.mjs settle "$1" --threshold "$ALERT_N" --state "$ALERT_STATE" 2>/dev/null || echo QUIET
}

# 一次 run 會往 log 追加內容，只取「最後一次 === 時間戳 ===」之後的區塊，避免拿到上一輪的失敗
RUN_LOG="$(mktemp "${TMPDIR:-/tmp}/tw-cm-run.XXXXXX")"
trap 'rm -f "$RUN_LOG"' EXIT
awk '/^=== [0-9]{4}-/{buf=""} {buf=buf $0 "\n"} END{printf "%s", buf}' "$LOG" > "$RUN_LOG" 2>/dev/null || cp "$LOG" "$RUN_LOG"

emit() { printf 'NOTIFY: %s\n' "$1"; }

# 1) 有來源改用快取
STALE_LINE="$(grep -a '^\[stale\] [0-9]' "$RUN_LOG" | tail -1 || true)"
if [[ -n "$STALE_LINE" ]]; then
    G="$(gate stale "${STALE_LINE#\[stale\] }")"
    echo "[alert] stale：$G"
    [[ "$G" == SHOULD_NOTIFY* ]] && emit "⚠️ 縣市統計有來源抓不到，已改用該來源的快取（其他來源照常更新）：${STALE_LINE#\[stale\] }。${G#SHOULD_NOTIFY }"
else
    G="$(clear_gate stale)"
    echo "[alert] stale：$G"
    [[ "$G" == RECOVERED* ]] && emit "✅ 之前抓不到的來源已恢復正常（${G#RECOVERED }），不必再處理"
fi

# 2) 來源整個壞掉（指標沿用上一版）
FAILED="$(grep -a '失敗：' "$RUN_LOG" | sed -e 's/^\[source\] //' -e 's/ *失敗：/ → /' | tr '\n' '、' || true)"
CARRIED_LINE="$(grep -a '^\[carried\] [0-9]' "$RUN_LOG" | tail -1 || true)"
if [[ -n "$FAILED" ]]; then
    G="$(gate source "${FAILED%、}")"
    echo "[alert] source：$G"
    [[ "$G" == SHOULD_NOTIFY* ]] && emit "⚠️ 縣市統計有來源失敗：${FAILED%、}${CARRIED_LINE:+（${CARRIED_LINE#\[carried\] }）}。其他來源照常更新，紀錄：${LOG}。${G#SHOULD_NOTIFY }"
else
    G="$(clear_gate source)"
    echo "[alert] source：$G"
    [[ "$G" == RECOVERED* ]] && emit "✅ 之前失敗的來源已恢復正常（${G#RECOVERED }），不必再處理"
fi

# 3) 數值變動異常（已沿用上一版）
ANOMALY_LINE="$(grep -a '^\[anomaly\] [0-9]' "$RUN_LOG" | tail -1 || true)"
if [[ -n "$ANOMALY_LINE" ]]; then
    G="$(gate anomaly "${ANOMALY_LINE#\[anomaly\] }")"
    echo "[alert] anomaly：$G"
    [[ "$G" == SHOULD_NOTIFY* ]] && emit "⚠️ 縣市統計有指標數值變動異常，已沿用上一版：${ANOMALY_LINE#\[anomaly\] }。請看一下是不是上游改了單位。紀錄：${LOG}。${G#SHOULD_NOTIFY }"
else
    G="$(clear_gate anomaly)"
    echo "[alert] anomaly：$G"
    [[ "$G" == RECOVERED* ]] && emit "✅ 之前數值異常的指標已恢復正常（${G#RECOVERED }）"
fi

exit 0
