# 台灣縣市地圖

22 個縣市的人口、醫療、房價、農業與選舉統計的互動地圖。從立委觀測站（`ly-dashboard`）的「縣市地圖」頁抽出來，
做成**純靜態快照站**：沒有後端、沒有資料庫，資料是 `public/data/*.json`，由 `scripts/snapshot.mjs` 從立委觀測站的 API 產生。

## 頁面

依「要做的事」分成五個分頁，最上面的**視角**（全國／某縣市）全站共用，可以設成「我的縣市」。

| 分頁 | 內容 |
| --- | --- |
| 地圖（預設） | 左欄可搜尋的指標選單（主題、次分類分組）、說明與統計；中間是同一個指標的地圖／排行／表格（含 CSV 下載）；右欄是視角的明細（指標名次、人口、同主題指標、選舉結果精簡版）。也可以載入自己的 JSON／XML／CSV |
| 總覽 | 全國：五大區域、分組卡片、縣市落差。縣市：強項與待關注（只看比率類指標）、可切換比較基準（全國／同級／同區域）、區內鄉鎮落差、可列印 |
| 比較 | 雙指標對照、選舉前後變化（變化率地圖與表格） |
| 選舉 | 選舉結果（全國看勝選版圖；縣市看選舉表、區域立委、六都議員席次）、得票趨勢、立委得票、分裂投票、人口與得票 |
| 人口與鄉鎮 | 鄉鎮地圖、人口趨勢 |

所有檢視狀態都在網址上（`?view=`、`?sub=`、`?county=`、`?metric=`…），改版前的 `?tab=`／`?area=` 連結由 `src/lib/legacyUrl.ts` 轉成新的參數。

程式結構：`src/App.tsx`（頁首、視角、分頁、載入資料）→ `src/views/*View.tsx`（各分頁）；指標模型在 `src/lib/metrics.ts`，數字格式在 `src/lib/format.ts`。

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

寫出 `public/data/county-stats.json`（另有 `county-trends.json`：縣市總覽的歷年趨勢），裡面每個指標都自帶名稱、單位、年度與來源，前端照著自動長出指標，
要再加統計只要改這支腳本。來源：衛福部醫事機構服務量統計年報（PDF 表 20／24／28）、長照 ABC 據點；
內政部實價登錄（最近四季）；戶政司村里人口與出生死亡（kiang/data.moi.gov.tw 轉存）；移民署新住民；
主計總處家庭收支調查與人力資源調查；國發會歲入歲出決算；國庫署公共債務；農業部農耕土地面積。
淨遷入是用「總增加－自然增加」推回來的（戶政司的遷入遷出表只有 xls／ods）。新一年要換腳本開頭的 `MOHW_PDF`、`MOHW_YEAR`、`SEASONS`。

議員席次只有六都（臺北市、新北市、桃園市、臺中市、臺南市、高雄市）有建置資料，其餘縣市不顯示那個區塊。
一屆動輒十幾個 0 席政黨，表格只列有席次的，其餘在下方用一句話帶過。

### 自動更新（Mac mini，每天 10:30）

`scripts/update_local.sh` 由 Mac mini 的 launchd 每天 10:30 執行（錯過時間會在喚醒後補跑）：
`git pull` → `snapshot.mjs`（本機立委觀測站 API）→ `county-stats.mjs` → `npm run build` →
**資料真的變動才 commit 並推送**，推送後由 `.github/workflows/pages.yml` 部署。

- 不用 GitHub Action：`snapshot.mjs` 要連 Mac mini 本機的 `127.0.0.1:8787`，政府網站也可能擋雲端 IP。
- 每份 API 回應都帶 `meta.generated_at`／`fetched_at`，比對時忽略這兩欄，只有時間戳記不同不算變動。
- `county-stats.mjs` 失敗時沿用前一份醫療、房價等統計，選舉快照照常更新，並跳通知。
- 專案有未提交的修改就略過；失敗跳 macOS 通知，紀錄在 `~/Library/Logs/tw-county-map-update.log`。
- 每年仍要人工改 `county-stats.mjs` 開頭的 `MOHW_PDF`、`MOHW_YEAR`、`SEASONS`。

```bash
./scripts/update_local.sh --install    # 安裝每日排程（--uninstall 移除；不帶參數＝立即跑一次）
```

`src/api/client.ts` 的 `slugFor()` 與 `scripts/snapshot.mjs` 的 `slugFor()` 是同一套規則：
`/api/v1/split-ticket?year=2024` → `split-ticket-year-2024`。

## 與立委觀測站的關係

最早是從立委觀測站（`ly-dashboard`）的「縣市地圖」頁抽出來的，之後版面與程式結構已重新設計，兩邊**不再同步**。
資料仍是觀測站 API 的快照（見上方「更新資料」）；這份 repo 沒有委員／議員的個人詳細頁。

## 資料來源

每個指標的機關、下載網址、目前資料期、算法、已知限制與驗證數字，詳見 [DATA_SOURCES.md](DATA_SOURCES.md)。

中央選舉委員會（歷屆選舉結果）、內政部戶政司（人口、戶數、面積）、立法院開放資料（立委）、衛福部統計處（醫療）、內政部實價登錄（房價、成交量）、農業部（耕地）。
原始彙整與計算在立委觀測站的後端，這裡只放結果快照。
