/**
 * 舊版一次到底的彙整（還沒拆完的部分）。
 *
 * 已獨立成模組：`medical.mjs`（醫療）、`house-price.mjs`（房價）、`farmland.mjs`（農地）、
 * `population.mjs`（人口結構）、`population-change.mjs`（人口動態）、`care.mjs`（長照）、
 * `fiscal.mjs`（財政）、`electricity.mjs`（用電）。
 * 這裡還剩：產業就業、教育、歷年趨勢。
 * 人口的中間結果一律從 `shared.population` 拿（`ages`／`total`／`share`／`elderlyOf`…）。
 *
 * 消費 `shared['house-price'].totals`（住宅成交總價）算房價所得比；房價掛掉時那幾欄就是 null。
 */

import { execFileSync, spawn } from 'node:child_process';
import { createInterface } from 'node:readline';
import { get as httpsGet } from 'node:https';
import { rootCertificates } from 'node:tls';
import { readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

import { COUNTIES, MOA, round, per10k, median, rocToIso, csvLine, normCounty } from '../lib/county.mjs';
import { latestResource } from '../lib/datagov.mjs';
import { villageCsv } from '../lib/moi.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';

export const id = 'legacy';
export const name = 'legacy（整包：人口～教育）';
export const provides = []; // 還沒有逐欄位宣告，第 2 輪拆開時補
export const dependsOn = ['population-change']; // 人口：分母與比率


/**
 * @param {{ items: Record<string, Record<string, number|null>>, fields: Array<object>,
 *           tmp: string, download: (url: string, name: string) => Promise<string> }} ctx
 */
export async function collect({ items, fields, tmp, download, shared }) {
  // 房價模組掛掉時不要讓整個 legacy 跟著爆：所得那幾欄就是 null
  const { ages, ageSum, total, allTotal, share, perMille, popPeriod, elderlyOf, sumAll } = shared.population;
  const trends = {}; // 歷年趨勢（所得、失業、債務、用電已經搬到各自模組，這裡只剩出生數與老年人口比率）
  const now = new Date();
/* ---------- 產業、就業、原住民、學校 ---------- */

/** 切一列 CSV（處理雙引號欄位） */
const csvLine = (l) => [...l.matchAll(/("([^"]*)"|[^,]*)(,|$)/g)].slice(0, -1).map((m) => m[2] ?? m[1]);
const normCounty = (name) => name.replace(/^\[\d+\]/, '').replace(/台/g, '臺').trim();

// 公司、商業登記（商工行政資料開放平臺，每月）：縣市列前面有縮排空白
async function gcisCounts(id) {
  const res = await latestResource(id, (d) => d.resourceFormat === 'CSV');
  const rows = (await (await fetchRetry(res.resourceDownloadUrl)).text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(csvLine);
  const out = {};
  for (const r of rows.slice(1)) { const c = normCounty(r[0]); if (items[c]) out[c] = { count: Number(r[1]), capital: Number(r[2]) }; }
  return { period: res.resourceDescription.replace(/年|月/g, (m) => (m === '年' ? '-' : '')), out };
}
const company = await gcisCounts(9346);
const business = await gcisCounts(25346);
const gcisMeta = (p) => ({ category: '產業', period: p, source: '經濟部商業發展署（商工行政資料開放平臺）', url: 'https://data.gcis.nat.gov.tw/' });
fields.push(
  { key: 'companies', label: '公司家數', unit: '家', ...gcisMeta(company.period), url: 'https://data.gov.tw/dataset/9346' },
  { key: 'companies_per1000', label: '每千人公司家數', unit: '家／千人', digits: 1, ...gcisMeta(company.period), url: 'https://data.gov.tw/dataset/9346', national: perMille(sumAll((c) => company.out[c]?.count ?? 0), allTotal) },
  { key: 'company_capital', label: '公司實收資本額', unit: '百萬元', ...gcisMeta(company.period), url: 'https://data.gov.tw/dataset/9346' },
  { key: 'businesses', label: '商業登記（行號）家數', unit: '家', ...gcisMeta(business.period), url: 'https://data.gov.tw/dataset/25346' },
  { key: 'businesses_per1000', label: '每千人商業登記家數', unit: '家／千人', digits: 1, ...gcisMeta(business.period), url: 'https://data.gov.tw/dataset/25346', national: perMille(sumAll((c) => business.out[c]?.count ?? 0), allTotal) },
);
for (const c of COUNTIES) {
  items[c].companies = company.out[c]?.count ?? null;
  items[c].companies_per1000 = company.out[c] ? perMille(company.out[c].count, total(c)) : null;
  items[c].company_capital = company.out[c] ? Math.round(company.out[c].capital) : null;
  items[c].businesses = business.out[c]?.count ?? null;
  items[c].businesses_per1000 = business.out[c] ? perMille(business.out[c].count, total(c)) : null;
}

// 生產中工廠（產業發展署登記工廠名錄；索引 CSV 指向每月更新的 zip）
const factoryIndex = (await (await fetchRetry('https://www.ida.gov.tw/opendata/02/SDD6569.csv')).text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(csvLine);
const factoryZip = await download(factoryIndex.at(-1).at(-1), 'factory.zip');
const factoryEntry = execFileSync('unzip', ['-Z1', factoryZip]).toString().trim().split('\n')[0]; // 例如 11509.csv
const factories = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
const factoryLines = execFileSync('unzip', ['-p', factoryZip, factoryEntry], { maxBuffer: 1 << 28 }).toString().split(/\r?\n/);
const fHeader = csvLine(factoryLines[0].replace(/^﻿/, ''));
const fCol = fHeader.indexOf('工廠市鎮鄉村里');
for (const l of factoryLines.slice(1)) {
  const c = normCounty(csvLine(l)[fCol] ?? '').slice(0, 3);
  if (c in factories) factories[c] += 1;
}
const factoryPeriod = `${Number(factoryEntry.slice(0, 3)) + 1911}-${factoryEntry.slice(3, 5)}`;
const idaMeta = { category: '產業', period: factoryPeriod, source: '經濟部產業發展署登記工廠名錄（生產中）', url: 'https://data.gov.tw/dataset/6569' };
fields.push(
  { key: 'factories', label: '生產中工廠家數', unit: '家', ...idaMeta },
  { key: 'factories_per10k', label: '每萬人工廠家數', unit: '家／萬人', digits: 1, ...idaMeta, national: per10k(sumAll((c) => factories[c]), allTotal) },
);
for (const c of COUNTIES) { items[c].factories = factories[c]; items[c].factories_per10k = per10k(factories[c], total(c)); }

// 勞保投保人數（勞保局，依投保單位所在地）；地區別代碼用同一資料集的官方「代號對照表」（23＝金門、24＝連江、25＝新竹市、26＝嘉義市）
const laborCodes = await latestResource(100999, (d) => d.resourceFormat === 'JSON' && d.resourceDescription === '代號對照表');
const LABOR = Object.fromEntries((await (await fetchRetry(laborCodes.resourceDownloadUrl)).json()).filter((r) => r['統計項目'] === '地區別').map((r) => [r['代號'], normCounty(r['對照中文名稱'])]));
const laborRes = await latestResource(100999, (d) => d.resourceFormat === 'JSON' && /^\d+年統計資料/.test(d.resourceDescription));
const laborRows = await (await fetchRetry(laborRes.resourceDownloadUrl)).json();
const laborYm = laborRows.reduce((m, r) => (r['資料年月'] > m ? r['資料年月'] : m), '');
const labor = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
for (const r of laborRows) if (r['資料年月'] === laborYm && LABOR[r['地區別']]) labor[LABOR[r['地區別']]] += Number(r['本月底投保人數']);
if (Object.values(labor).some((n) => n === 0)) throw new Error('勞保地區別代碼對不上，有縣市是 0');
const laborMeta = { category: '產業', period: `${Number(laborYm.slice(0, 3)) + 1911}-${laborYm.slice(3)} 月底`, source: '勞動部勞工保險局投保單位、人數原始統計', url: 'https://data.gov.tw/dataset/100999' };
fields.push(
  { key: 'labor_insured', label: '勞保投保人數（依投保單位所在地）', unit: '人', ...laborMeta },
  { key: 'labor_insured_per1000', label: '每千人勞保投保人數', unit: '人／千人', digits: 1, ...laborMeta, national: perMille(sumAll((c) => labor[c]), allTotal) },
);
for (const c of COUNTIES) { items[c].labor_insured = labor[c]; items[c].labor_insured_per1000 = perMille(labor[c], total(c)); }

// 國民年金被保險人數（勞保局，國民年金監理會每月 PDF「按身分別及地區分」，地區依戶籍）
const npList = await (await fetchRetry('https://dep.mohw.gov.tw/NPSC/lp-5387-118-1-20.html')).text();
const npLink = npList.match(/(dl-\d+-[0-9a-f-]+\.html)" title="(\d+)年(\d+)月-pdf/);
if (!npLink) throw new Error('國民年金監理會的列表頁格式變了，找不到最新月份的 PDF');
const npPdf = await download(`https://dep.mohw.gov.tw/NPSC/${npLink[1]}`, 'national-pension.pdf');
const npRows = {};
for (const line of execFileSync('pdftotext', ['-layout', npPdf, '-']).toString().split('\n')) {
  const m = line.match(/^\s*((?:\S\s*){2}[縣市])\s+([\d,]+)/);
  // PDF 文字裡有 CJK 相容字（「北」是 U+F963、「蘭」是 U+F91F…），看起來一樣但比對不上，先 NFKC 正規化
  const c = m?.[1].replace(/\s/g, '').normalize('NFKC');
  if (c && items[c] && !(c in npRows)) npRows[c] = Number(m[2].replace(/,/g, ''));
}
if (Object.keys(npRows).length !== COUNTIES.length) throw new Error(`國民年金 PDF 只讀到 ${Object.keys(npRows).length} 個縣市`);
const npMeta = { category: '經濟', period: `${Number(npLink[2]) + 1911}-${npLink[3].padStart(2, '0')}`, source: '勞動部勞工保險局（國民年金監理會「國民年金被保險人數－按身分別及地區分」）', url: 'https://dep.mohw.gov.tw/NPSC/lp-5387-118-1-20.html' };
const age25to64 = (c) => ageSum(c, 25, 64);
fields.push(
  { key: 'national_pension', label: '國民年金被保險人數', unit: '人', ...npMeta },
  { key: 'national_pension_ratio', label: '國保被保險人占 25–64 歲人口比率', unit: '%', ...npMeta, national: share(sumAll((c) => npRows[c]), sumAll(age25to64)) },
);
for (const c of COUNTIES) { items[c].national_pension = npRows[c]; items[c].national_pension_ratio = share(npRows[c], age25to64(c)); }

// 全民健保：全國設籍人口參加健保人數（健保署，每年；縣市×鄉鎮×性別×年齡），參加率的分母用同月戶籍人口
const nhiRes = await latestResource(37276, (d) => d.resourceFormat === 'CSV');
const nhiLines = (await (await fetchRetry(nhiRes.resourceDownloadUrl)).text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
const nhi = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
let nhiYm = '';
for (const l of nhiLines.slice(1)) {
  const r = l.split(',');
  const c = normCounty(r[1] ?? '');
  if (c in nhi) { nhi[c] += Number(r[6]) || 0; nhiYm = r[0]; }
}
const nhiPopYm = `${Number(nhiYm.slice(0, 3)) + 1911}/${nhiYm.slice(3)}`;
const nhiPop = await villageCsv('population', nhiPopYm);
if (!nhiPop) throw new Error(`缺 ${nhiPopYm} 的村里人口資料（健保參加率的分母）`);
const nhiMeta = { category: '醫療', period: nhiPopYm.replace('/', '-'), source: '衛福部中央健康保險署全國設籍人口參加健保人數', url: 'https://data.gov.tw/dataset/37276' };
fields.push(
  { key: 'nhi_insured', label: '設籍人口參加健保人數', unit: '人', ...nhiMeta },
  { key: 'nhi_coverage', label: '健保參加率（參加健保人數 ÷ 同月戶籍人口）', unit: '%', ...nhiMeta, national: share(sumAll((c) => nhi[c]), sumAll((c) => nhiPop[c]['人口數'])) },
);
for (const c of COUNTIES) { items[c].nhi_insured = nhi[c]; items[c].nhi_coverage = share(nhi[c], nhiPop[c]['人口數']); }

// 原住民人口（戶政司現住原住民人口按性別、年齡；村里×性別×身分×年齡約 470 萬列，用串流加總）
const indRes = await latestResource(77129, (d) => /^\d{5}/.test(d.resourceDescription) && d.resourceFormat === 'ZIP');
const indZip = await download(indRes.resourceDownloadUrl, 'indigenous.zip');
const indigenous = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
const indProc = spawn('unzip', ['-p', indZip]);
for await (const line of createInterface({ input: indProc.stdout })) {
  const r = line.split(',');
  const c = r[2]?.slice(0, 3);
  // 只算平地＋山地原住民（一般說的原住民人口）；「平埔原住民」是新增的身分別，全國約一千多人，不併入
  if (c in indigenous && (r[5] === '平地原住民' || r[5] === '山地原住民')) indigenous[c] += Number(r[7]) || 0;
}
const indYm = indRes.resourceDescription.slice(0, 5);
const indMeta = { category: '人口', period: `${Number(indYm.slice(0, 3)) + 1911}-${indYm.slice(3)}`, source: '內政部戶政司現住原住民人口', url: 'https://data.gov.tw/dataset/77129' };
fields.push(
  { key: 'indigenous', label: '原住民人口（平地＋山地）', unit: '人', ...indMeta },
  { key: 'indigenous_ratio', label: '原住民人口比率', unit: '%', ...indMeta, national: share(sumAll((c) => indigenous[c]), allTotal) },
);
for (const c of COUNTIES) { items[c].indigenous = indigenous[c]; items[c].indigenous_ratio = share(indigenous[c], total(c)); }

// 學校數（教育部統計處各級學校名錄；多學年度合在一個檔的只取最新學年度）
async function schoolCount(url) {
  const rows = (await (await fetchRetry(url)).text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(csvLine);
  const col = rows[0].indexOf('縣市名稱');
  const year = rows.slice(1).reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0);
  const out = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
  for (const r of rows.slice(1)) { const c = normCounty(r[col] ?? ''); if (Number(r[0]) === year && c in out) out[c] += 1; }
  return { year, out };
}
const SCHOOLS = [
  ['schools_kindergarten', '幼兒園數', 'https://stats.moe.gov.tw/files/opendata/k1_new.csv', 6086],
  ['schools_primary', '國小數', (await latestResource(6087, (d) => d.resourceDownloadUrl.endsWith('.csv'))).resourceDownloadUrl, 6087],
  ['schools_junior', '國中數', 'https://stats.moe.gov.tw/files/opendata/j1_new.csv', 6088],
  ['schools_senior', '一般高中數', (await latestResource(6089, (d) => d.resourceDownloadUrl.endsWith('.csv'))).resourceDownloadUrl, 6089],
  ['schools_college', '大專校院數', 'https://stats.moe.gov.tw/files/opendata/u1_new.csv', 6091],
];
let primaryCount;
for (const [key, label, url, id] of SCHOOLS) {
  const { year, out } = await schoolCount(url);
  fields.push({ key, label, unit: '所', category: '教育', period: `${year} 學年度`, source: '教育部統計處各級學校名錄', url: `https://data.gov.tw/dataset/${id}` });
  for (const c of COUNTIES) items[c][key] = out[c];
  if (key === 'schools_primary') primaryCount = { year, out };
}
fields.push({ key: 'pupils_per_primary_school', label: '平均每所國小的學齡兒童數', unit: '人／校', category: '教育', period: `${primaryCount.year} 學年度；人口 ${popPeriod}`, source: '教育部國小名錄＋戶政司 6–11 歲人口', url: 'https://data.gov.tw/dataset/6087',
  national: Math.round(sumAll((c) => ageSum(c, 6, 11)) / sumAll((c) => primaryCount.out[c])) });
for (const c of COUNTIES) items[c].pupils_per_primary_school = primaryCount.out[c] ? Math.round(ageSum(c, 6, 11) / primaryCount.out[c]) : null;

/* ---------- 歷年趨勢：出生數、65 歲以上比率（近 5 個完整年度，戶政司村里資料加總） ---------- */

const trendYears = Array.from({ length: 5 }, (_, i) => now.getUTCFullYear() - 5 + i);
trends.births = { label: '出生數', unit: '人', points: [] };
trends.elderly_ratio = { label: '老年人口比率', unit: '%', points: [] };
for (const y of trendYears) {
  const births = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
  for (let m = 1; m <= 12; m++) {
    const b = await villageCsv('bdmd', `${y}/${String(m).padStart(2, '0')}`);
    if (!b) throw new Error(`缺 ${y}/${m} 的出生死亡資料`);
    for (const c of COUNTIES) births[c] += b[c]['出生數'];
  }
  trends.births.points.push({ period: String(y), values: births });
  const dec = await villageCsv('population', `${y}/12`);
  if (!dec) throw new Error(`缺 ${y}/12 的村里人口資料`);
  trends.elderly_ratio.points.push({ period: String(y), national: share(COUNTIES.reduce((s, c) => s + elderlyOf(dec, c), 0), COUNTIES.reduce((s, c) => s + dec[c]['人口數'], 0)), values: Object.fromEntries(COUNTIES.map((c) => [c, share(elderlyOf(dec, c), dec[c]['人口數'])])) });
}
  return { trends };
}
