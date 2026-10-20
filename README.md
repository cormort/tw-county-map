# 台灣縣市地圖

22 個縣市的人口、醫療、房價、農業與選舉統計的互動地圖。從立委觀測站（`ly-dashboard`）的「縣市地圖」頁抽出來，
做成**純靜態快照站**：沒有後端、沒有資料庫，資料是 `public/data/*.json`，由 `scripts/snapshot.mjs` 從立委觀測站的 API 產生。

## 頁面

主題優先：最上面先選主題（人口、醫療、房價、農業、選舉、自訂），下面的指標選單與分頁跟著主題變。

| 主題 | 分頁 |
| --- | --- |
| 每個主題都有 | 互動地圖（依指標上色，點縣市看右側明細）、雙指標對比、排行榜、原始資料（含 CSV 下載） |
| 人口 | ＋人口趨勢（歷年變化與推估）、鄉鎮地圖 |
| 選舉 | ＋得票趨勢、立委得票、分裂投票、人口與得票、時間差異、鄉鎮地圖；縣市明細才會出現議員席次、區域立委與選舉表（六都另有議員選舉與席次） |
| 醫療／房價／農業 | 縣市明細列出該主題各指標 |
| 自訂 | 載入自己的 JSON／XML／CSV（API 網址或檔案），有縣市欄就能當指標 |

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
`population-trend.json`、`town-map.json`、`split-ticket.json` 與每年一份 `split-ticket-year-YYYY.json`、
六都各一份 `council-county-<縣市>.json`（議員席次），以及記錄產生時間的 `_snapshot.json`（頁首會顯示）。

醫療、房價、農地另有一支腳本，直接抓政府開放資料，不經過立委觀測站：

```bash
node scripts/county-stats.mjs   # 需要 pdftotext（brew install poppler）與 unzip
```

寫出 `public/data/county-stats.json`，裡面每個指標都自帶名稱、單位、年度與來源，前端照著自動長出指標，
要再加統計只要改這支腳本。來源有三個：衛福部醫事機構服務量統計年報（PDF 表 20／24／28）、
內政部實價登錄（最近四季）、農業部農耕土地面積。新一年要換腳本開頭的 `MOHW_PDF`、`MOHW_YEAR`、`SEASONS`。

議員席次只有六都（臺北市、新北市、桃園市、臺中市、臺南市、高雄市）有建置資料，其餘縣市不顯示那個區塊。
一屆動輒十幾個 0 席政黨，表格只列有席次的，其餘在下方用一句話帶過。

`src/api/client.ts` 的 `slugFor()` 與 `scripts/snapshot.mjs` 的 `slugFor()` 是同一套規則：
`/api/v1/split-ticket?year=2024` → `split-ticket-year-2024`。

## 與立委觀測站的關係

- 程式碼：`pages/CountiesPage.tsx`、`components/`（地圖、得票、人口、分裂投票…）、`lib/` 都是從觀測站複製過來的，
  改動其中一邊時要記得同步。
- 這份 repo 沒有委員／議員的個人詳細頁；縣市明細的議員席次是直接攤在頁面上的（`components/CouncilSeats.tsx`），
  不是連到別的頁。

## 資料來源

中央選舉委員會（歷屆選舉結果）、內政部戶政司（人口、戶數、面積）、立法院開放資料（立委）、衛福部統計處（醫療）、內政部實價登錄（房價、成交量）、農業部（耕地）。
原始彙整與計算在立委觀測站的後端，這裡只放結果快照。
