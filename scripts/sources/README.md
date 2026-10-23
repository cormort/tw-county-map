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

## 現有模組（17 個）

| 模組 | 內容 | 依賴 |
| --- | --- | --- |
| `medical` | 衛福部醫事機構年報（PDF）＋年報年底人口 | — |
| `house-price` | 實價登錄四季房價、成交量 | medical |
| `farmland` | 農業部耕地面積 | — |
| `population` | 戶政司村里人口、出生死亡、移民署新住民（**地基**） | — |
| `population-change` | 人口增減、淨遷入、高齡化速度、扶老扶幼比 | population |
| `care` | 長照 ABC 據點 | population |
| `income` | 所得、失業率、房價所得比 | population, house-price |
| `fiscal` | 歲入歲出決算、公共債務 | population |
| `electricity` | 台電縣市別用電 | population |
| `business` | 公司、商業登記 | population |
| `factories` | 產發署登記工廠名錄（zip） | population |
| `labor` | 勞保投保人數 | population |
| `pension` | 國民年金被保險人數（每月 PDF） | population |
| `health-insurance` | 健保參加人數、參加率 | population |
| `indigenous` | 原住民族人口（470 萬列串流） | population |
| `education` | 教育部各級學校名錄＋每所國小學齡人口 | population |
| `population-trends` | 歷年出生數、老年人口比率 | population |

## 失敗時的三種狀態

| 狀態 | 意思 | 指標會怎樣 | 通知 |
| --- | --- | --- | --- |
| `ok` | 這次抓到 | 新值 | — |
| `stale`（來源快取） | 連不上，改用該網址上一次成功的內容 | 上一次成功的值 | ⚠️ 有來源抓不到，已用快取 |
| `carried`（沿用上一版） | 模組整個失敗，這一欄沿用上一版 JSON | 上一版的值＋`carried_at` | ⚠️ 有來源失敗：〈模組名〉 |

`meta.sources` 記每個來源的狀態，`meta.stale_sources`／`meta.carried` 記哪些資料不是今天算的。
不管哪一種，**指標都不會從畫面消失**（欄位順序也照上一版排，不會跳位）。

## 新增一個來源

1. 在 `scripts/sources/` 加檔案，照上面的介面 `export`
2. 在 `index.mjs` 的 `sources` 陣列加一行
3. `node scripts/county-stats.mjs` 跑一次，確認 `fields` 多了預期的指標、`meta.sources` 是 `ok`
