# 台灣縣市地圖

22 個縣市的人口、面積、選舉結果、立委與議員分布的互動地圖。從立委觀測站（`ly-dashboard`）的「縣市地圖」頁抽出來，
做成**純靜態快照站**：沒有後端、沒有資料庫，資料是 `public/data/*.json`，由 `scripts/snapshot.mjs` 從立委觀測站的 API 產生。

## 頁面

| 頁籤 | 內容 |
| --- | --- |
| 互動地圖 | 依指標上色（人口數、人口密度、投票率、得票率…），點縣市看右側明細 |
| 鄉鎮地圖 | 鄉鎮市區層級的地圖 |
| 得票趨勢 | 各黨歷屆得票率趨勢 |
| 立委得票 | 各縣市立委候選人得票 |
| 分裂投票 | 立委與總統得票的對照（可切 2012／2016／2020／2024） |
| 人口與得票 | 人口結構與得票的交叉分析 |
| 人口趨勢 | 歷年人口變化（含推估） |
| 雙指標對比／時間差異／排行榜／原始資料 | 兩兩指標比較、前後次選舉差異、排序表、CSV 下載 |

## 開發

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # 產出 dist/（純靜態）
npm run preview    # 預覽 dist/
```

## 更新資料

資料不是即時抓的，是快照：

```bash
# 立委觀測站的 API 要先跑起來（預設 http://127.0.0.1:8787）
node scripts/snapshot.mjs
API=http://127.0.0.1:8787 node scripts/snapshot.mjs   # 指定別的來源
```

會寫出 `public/data/`：`counties.json`、`council-only-counties.json`、`legislator-votes.json`、`demographics.json`、
`population-trend.json`、`town-map.json`、`split-ticket.json` 與每年一份 `split-ticket-year-YYYY.json`，
以及記錄產生時間的 `_snapshot.json`（頁首會顯示）。

`src/api/client.ts` 的 `slugFor()` 與 `scripts/snapshot.mjs` 的 `slugFor()` 是同一套規則：
`/api/v1/split-ticket?year=2024` → `split-ticket-year-2024`。

## 與立委觀測站的關係

- 程式碼：`pages/CountiesPage.tsx`、`components/`（地圖、得票、人口、分裂投票…）、`lib/` 都是從觀測站複製過來的，
  改動其中一邊時要記得同步。
- 這份 repo 沒有委員／議員的詳細頁，所以縣市明細裡的「議員選舉與席次」連結是空的（`pathFor()` 回 hash）。

## 資料來源

中央選舉委員會（歷屆選舉結果）、內政部戶政司（人口、戶數、面積）、立法院開放資料（立委）。
原始彙整與計算在立委觀測站的後端，這裡只放結果快照。
