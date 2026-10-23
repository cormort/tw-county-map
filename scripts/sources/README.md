# 來源模組（scripts/sources/）

一支腳本、一個來源一個檔案。目的是讓「某個政府網站壞掉」只影響它自己的欄位，
而且每個來源都能單獨跑、單獨測。

## 介面

```js
export const name = '教育部各級學校';        // 通知與 meta.sources 顯示用
export const provides = ['schools_primary'];  // 這個模組會填哪些 key（文件與衝突檢查用）
export const dependsOn = ['population'];      // 需要其他模組先算好的資料（可省略）

export async function collect(ctx) {
  return {
    fields: [{ key, label, unit, category, period, source, url, digits?, national? }],
    values: { 臺北市: { schools_primary: 147 } },   // 只寫自己的 key
    trends: { /* 選用，縣市總覽的歷年趨勢 */ },
  };
}
```

`ctx` 由 runner 提供：

- `items` / `fields`：要寫的兩個容器（大部份模組用回傳值就好，需要跟別人共用中間結果時才直接讀寫）
- `tmp`：本次執行專用的暫存目錄（下載 PDF、解 zip 都放這裡）
- `download(url, name)`：下載到 `tmp`，回傳本機路徑（內含 3 次重試）
- `trends`：趨勢容器

## 共用工具（scripts/lib/）

| 檔案 | 內容 |
| --- | --- |
| `fetch-cache.mjs` | `fetchRetry()`：3 次重試＋來源快取（`.cache/sources/`），掛掉時改用該網址上一次成功的內容；`staleSources` 由 runner 寫進 `meta.stale_sources` |
| `county.mjs` | `COUNTIES`、`LVR`、`MOA`、`round`、`per10k`、`median`、`monthsBack`、`rocToIso`、`csvLine`、`normCounty` |
| `download.mjs` | `makeDownloader(tmpDir)`、`pdfLines()`（pdftotext） |
| `datagov.mjs` | `latestResource(id, pick)`：data.gov.tw 資料集的最新一份資源 |

## runner（scripts/county-stats.mjs）

1. 建 `items`／`fields`／`trends`，把 `ctx` 傳給每個模組
2. 依 `dependsOn` 拓撲排序後逐一 `collect()`，**單一來源失敗不影響其他來源**
3. 寫出 `public/data/county-stats.json`（`meta.sources` 記錄每個來源的狀態）
4. 有來源改用快取時印 `[stale]`，排程腳本會轉成通知

## 新增一個來源

1. 在 `scripts/sources/` 加檔案，照上面的介面 `export`
2. 在 `index.mjs` 的 `sources` 陣列加一行
3. `node scripts/county-stats.mjs` 跑一次，確認 `fields` 多了預期的指標、`meta.sources` 是 `ok`
