/**
 * 國民年金被保險人數（按身分別及地區分，地區依戶籍）。
 *
 * 來源有兩條，順序是「先 CSV，後 PDF」：
 *
 * 1. 勞保局「統計月報」的 CSV（**主要**）。`events.bli.gov.tw/report//reportM.aspx?m=<民國年月>&f=a9020`
 *    是月報的入口頁，CSV 在 `attachment_file/report/month/<民國年月>/a9020.csv`。
 *    未發布的月份入口頁回 500，所以「往新的月份試、回 200 的就是最新一期」。
 * 2. 衛福部國民年金監理會的月 PDF（**備援**）。2026-11-22 起 `dep.mohw.gov.tw/NPSC/lp-5387-118-1-20.html`
 *    的列表回「共0筆資料，第0/0頁」，`dl-*.html` 連結整個不見（監理會網站改版中），
 *    所以它現在幾乎一定失敗 —— 但留著，等對面回來就不用再改。
 *
 * PDF 文字裡有 CJK 相容字（「北」是 U+F963、「蘭」是 U+F91F…），看起來一樣但比對不上，先 NFKC 正規化。
 */
import { COUNTIES, csvLine, normCounty, rocToIso, share } from '../lib/county.mjs';
import { pdfLines } from '../lib/download.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';

export const id = 'pension';
export const name = '國民年金（勞保局統計月報）';
export const provides = ['national_pension', 'national_pension_ratio'];
export const dependsOn = ['population'];

const BLI_REPORT = 'https://events.bli.gov.tw/report//reportM.aspx';
const BLI_CSV = 'https://events.bli.gov.tw/report/attachment_file/report/month';
const NPSC_LIST = 'https://dep.mohw.gov.tw/NPSC/lp-5387-118-1-20.html';

/** 「新　 北　 市」→「新北市」；順便把台／臺統一（normCounty 會做） */
const countyName = (cell) => normCounty(String(cell ?? '').replace(/\s/g, '').normalize('NFKC'));

/**
 * 勞保局月報 CSV → { counties: 縣市→人數, total: 總計 }。
 * 表頭有「國民年金被保險人數」，抓到別的頁面（錯誤頁、別的報表）就丟錯，不要讓整欄變 0。
 */
export function parseNpCsv(text) {
  if (!text.includes('國民年金被保險人數')) throw new Error('勞保局月報 CSV 的表頭不是國民年金報表');
  const counties = {};
  let total = null;
  for (const line of text.split(/\r?\n/)) {
    if (!line.trim()) continue;
    const cells = csvLine(line);
    const label = countyName(cells[0]);
    const value = String(cells[1] ?? '').replace(/[,\s]/g, '');
    if (!/^\d+$/.test(value)) continue;
    if (label === '總計') total = Number(value);
    else if (COUNTIES.includes(label) && !(label in counties)) counties[label] = Number(value);
  }
  return { counties, total };
}

/** 國民年金 PDF 的文字行 → 縣市 → 被保險人數。 */
export function parseNpRows(lines) {
  const rows = {};
  for (const line of lines) {
    const m = line.match(/^\s*((?:\S\s*){2}[縣市])\s+([\d,]+)/);
    const c = m?.[1].replace(/\s/g, '').normalize('NFKC');
    if (c && COUNTIES.includes(c) && !(c in rows)) rows[c] = Number(m[2].replace(/,/g, ''));
  }
  return rows;
}

/** 往新的月份試：入口頁 200 就是有這個月份（未發布回 500）。找不到回 null。 */
export async function latestMonth(today = new Date()) {
  let roc = today.getFullYear() - 1911;
  let month = today.getMonth() + 1;
  for (let i = 0; i < 14; i += 1) {
    const ym = roc * 100 + month;
    try {
      const res = await fetch(`${BLI_REPORT}?m=${ym}&f=a9020`, { signal: AbortSignal.timeout(15_000) });
      if (res.ok) return ym;
    } catch {
      // 連不上就往下一個月找
    }
    month -= 1;
    if (month === 0) { month = 12; roc -= 1; }
  }
  return null;
}

/** 勞保局月報 CSV：回 { rows, meta } */
async function fromBliCsv() {
  const ym = await latestMonth();
  if (!ym) throw new Error('勞保局統計月報找不到任何一期國民年金報表');
  const url = `${BLI_CSV}/${ym}/a9020.csv`;
  const text = await (await fetchRetry(url, { requireOk: true, label: '勞保局月報 CSV' })).text();
  const { counties, total } = parseNpCsv(text);
  const missing = COUNTIES.filter((c) => !(c in counties));
  if (missing.length) throw new Error(`勞保局月報 CSV 少 ${missing.length} 個縣市（${missing.slice(0, 3).join('、')}…）`);
  // 22 縣市加總要對得上「總計」，否則是把別的欄位當人數了
  const sum = COUNTIES.reduce((acc, c) => acc + counties[c], 0);
  if (total && Math.abs(sum - total) > total * 0.01) throw new Error(`勞保局月報 CSV 縣市加總 ${sum} 與總計 ${total} 差太多`);
  return {
    rows: counties,
    meta: {
      period: rocToIso(String(ym)),
      source: '勞動部勞工保險局（國民年金被保險人數－按身分別及地區分，統計月報）',
      url: `${BLI_REPORT}?m=${ym}&f=a9020`,
    },
  };
}

/** 備援：監理會月 PDF（列表頁 2026-11 起改版，多半會失敗） */
async function fromNpscPdf(download) {
  const list = await (await fetchRetry(NPSC_LIST)).text();
  const npLink = list.match(/(dl-\d+-[0-9a-f-]+\.html)" title="(\d+)年(\d+)月-pdf/);
  if (!npLink) throw new Error('監理會列表頁沒有 dm-…-pdf 連結（頁面回「共0筆資料」＝網站改版中）');
  const pdf = await download(`https://dep.mohw.gov.tw/NPSC/${npLink[1]}`, 'national-pension.pdf');
  const rows = parseNpRows(pdfLines(pdf));
  if (Object.keys(rows).length !== COUNTIES.length) throw new Error(`國民年金 PDF 只讀到 ${Object.keys(rows).length} 個縣市`);
  return {
    rows,
    meta: {
      period: `${Number(npLink[2]) + 1911}-${npLink[3].padStart(2, '0')}`,
      source: '勞動部勞工保險局（國民年金監理會「國民年金被保險人數－按身分別及地區分」）',
      url: NPSC_LIST,
    },
  };
}

export async function collect({ items, fields, download, shared }) {
  const { ageSum, sumAll } = shared.population;
  let result;
  try {
    result = await fromBliCsv();
  } catch (csvError) {
    console.warn(`[source] 國民年金改用監理會 PDF：${csvError?.message ?? csvError}`);
    try {
      result = await fromNpscPdf(download);
    } catch (pdfError) {
      throw new Error(`勞保局 CSV 與監理會 PDF 都失敗（CSV：${csvError?.message ?? csvError}；PDF：${pdfError?.message ?? pdfError}）`);
    }
  }
  const { rows: npRows, meta: npMeta } = result;
  const age25to64 = (c) => ageSum(c, 25, 64);
  fields.push(
    { key: 'national_pension', label: '國民年金被保險人數', unit: '人', category: '經濟', ...npMeta },
    { key: 'national_pension_ratio', label: '國保被保險人占 25–64 歲人口比率', unit: '%', category: '經濟', ...npMeta, national: share(sumAll((c) => npRows[c]), sumAll(age25to64)) },
  );
  for (const c of COUNTIES) { items[c].national_pension = npRows[c]; items[c].national_pension_ratio = share(npRows[c], age25to64(c)); }
}
