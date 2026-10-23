/**
 * 舊版一次到底的彙整（還沒拆完的部分）。
 *
 * 已獨立成模組：`medical.mjs`（醫療）、`house-price.mjs`（房價）、`farmland.mjs`（農地）、
 * `population.mjs`（人口結構）、`population-change.mjs`（人口動態）。
 * 這裡還剩：長照、所得失業、財政、用電、產業就業、教育、歷年趨勢。
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
import { villageCsv } from '../lib/moi.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';
import { latestResource } from '../lib/datagov.mjs';

export const id = 'legacy';
export const name = 'legacy（整包：人口～教育）';
export const provides = []; // 還沒有逐欄位宣告，第 2 輪拆開時補
export const dependsOn = ['house-price', 'population-change']; // 房價：成交總價；人口：分母與比率


/**
 * @param {{ items: Record<string, Record<string, number|null>>, fields: Array<object>,
 *           tmp: string, download: (url: string, name: string) => Promise<string> }} ctx
 */
export async function collect({ items, fields, tmp, download, shared }) {
  // 房價模組掛掉時不要讓整個 legacy 跟著爆：所得那幾欄就是 null
  const { ages, ageSum, total, allTotal, share, perMille, popPeriod, elderlyOf, sumAll } = shared.population;
  const now = new Date();
  const totals = shared['house-price']?.totals ?? Object.fromEntries(COUNTIES.map((c) => [c, []]));
  // 房價的期間說明（「近四季申報：…」）在房價模組裡算，這裡直接用
  const lvr = shared['house-price']?.meta ?? { period: '房價資料缺少', source: '內政部實價登錄', url: 'https://plvr.land.moi.gov.tw/DownloadOpenData' };
/* ---------- 長照（衛福部長照 ABC 據點，每日更新） ---------- */

const ltcCsv = await (await fetchRetry('https://ltcpap.mohw.gov.tw/publish/abc.csv')).text();
const ltc = Object.fromEntries(COUNTIES.map((c) => [c, new Set()]));
for (const line of ltcCsv.split(/\r?\n/).slice(1)) {
  // "機構名稱","機構代碼","機構種類","縣市代碼",…,"O_ABC"：同一機構每個特約服務各一列，用機構代碼去重。
  // ponytail: 不分 A/B/C —— 臺北市在這份檔案裡一個 C 據點都沒有，C 據點顯然沒完整登錄在這裡
  const m = line.match(/^"[^"]*","([^"]*)","[^"]*","(\d+)",/);
  const county = m && MOA[m[2]];
  if (!county) continue;
  ltc[county].add(m[1]);
}
const ltcMeta = { category: '醫療', period: new Date().toISOString().slice(0, 10), source: '衛福部長照 ABC 據點', url: 'https://data.gov.tw/dataset/88270' };
const elderlyAll = sumAll((c) => elderlyOf(ages, c));
fields.push(
  { key: 'ltc_points', label: '長照 ABC 據點數', unit: '處', ...ltcMeta },
  { key: 'ltc_per1000_elderly', label: '每千名 65 歲以上長者的長照據點', unit: '處／千人', digits: 1, ...ltcMeta,
    national: perMille(sumAll((c) => ltc[c].size), elderlyAll) },
);
for (const c of COUNTIES) {
  items[c].ltc_points = ltc[c].size;
  items[c].ltc_per1000_elderly = perMille(ltc[c].size, elderlyOf(ages, c));
}

/* ---------- 所得、失業率（主計總處）；ws.dgbas.gov.tw 的憑證鏈缺中繼憑證，自己補上 ---------- */

const twcaDer = Buffer.from(await (await fetchRetry('http://sslserver.twca.com.tw/cacert/Cyber_SSL_2023.crt')).arrayBuffer());
const twcaPem = `-----BEGIN CERTIFICATE-----\n${twcaDer.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
const fetchDgbas = (url) => new Promise((resolve, reject) => {
  httpsGet(url, { ca: [...rootCertificates, twcaPem] }, (res) => {
    if (res.statusCode !== 200) return reject(new Error(`${url} → HTTP ${res.statusCode}`));
    const chunks = [];
    res.on('data', (d) => chunks.push(d)).on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  }).on('error', reject);
});
const trends = {}; // key → { label, unit, points: [{ period, values: { 縣市: 值 } }] }

// 平均每戶可支配所得（年，1998 起；金門、連江不在家庭收支調查範圍）
const incomeRows = (await fetchDgbas('https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/232214/006-%E5%B9%B3%E5%9D%87%E6%AF%8F%E6%88%B6%E5%8F%AF%E6%94%AF%E9%85%8D%E6%89%80%E5%BE%97%E6%8C%89%E5%8D%80%E5%9F%9F%E5%88%A5%E5%88%86.csv'))
  .replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split(',').map((x) => x.replace(/"/g, '')));
const incomeHeader = incomeRows[0].map((h) => h.replace(/-元$/, ''));
const incomeByYear = incomeRows.slice(1).map((r) => ({ period: r[0], national: Number(r[1]), values: Object.fromEntries(incomeHeader.slice(1).map((h, i) => [h, Number(r[i + 1])]).filter(([h]) => items[h])) }));
const incomeLatest = incomeByYear.at(-1);
const nationalIncome = Number(incomeRows.at(-1)[1]);
trends.income = { label: '平均每戶可支配所得', unit: '元', points: incomeByYear.slice(-10) };
const dgbasIncome = { category: '經濟', period: `${incomeLatest.period} 年`, source: '主計總處家庭收支調查', url: 'https://data.gov.tw/dataset/9415' };
fields.push({ key: 'income', label: '平均每戶可支配所得', unit: '元', ...dgbasIncome, national: nationalIncome });
for (const c of COUNTIES) items[c].income = incomeLatest.values[c] ?? null;

// 房價所得比：住宅成交總價中位數 ÷ 平均每戶可支配所得（官方用中位數所得，這裡只有平均數，數字會偏低一些）
fields.push({ key: 'price_to_income', label: '房價所得比（成交總價中位數 ÷ 平均每戶可支配所得）', unit: '倍', digits: 1, category: '房價', period: `${lvr.period}；所得 ${incomeLatest.period} 年`, source: '內政部實價登錄＋主計總處家庭收支調查', url: 'https://plvr.land.moi.gov.tw/DownloadOpenData',
  national: round(median(Object.values(totals).flat()) / nationalIncome) });
for (const c of COUNTIES) {
  const m = median(totals[c]);
  items[c].price_to_income = m !== null && items[c].income ? round(m / items[c].income) : null;
}

// 失業率（年；只取已過完的完整年度，表裡也有半年列）
const unempXml = await fetchDgbas('https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230038/mp0101a10.xml');
const unempByYear = [...unempXml.matchAll(/<縣市別失業率>([\s\S]*?)<\/縣市別失業率>/g)].map(([, body]) => ({
  period: body.match(/<年月別_Year_and_month>([^<]*)</)[1],
  values: Object.fromEntries([...body.matchAll(/<([^_<>]+)_[^>]*_百分比>([^<]*)</g)].filter(([, n]) => items[n]).map(([, n, v]) => [n, Number(v)])),
  national: Number(body.match(/<臺灣地區_Taiwan_Area_百分比>([^<]*)</)?.[1]),
})).filter((r) => /^\d{4}$/.test(r.period) && Number(r.period) < now.getUTCFullYear());
const unempLatest = unempByYear.at(-1);
trends.unemployment = { label: '失業率', unit: '%', points: unempByYear.slice(-10) };
fields.push({ key: 'unemployment', label: '失業率', unit: '%', category: '經濟', period: `${unempLatest.period} 年`, source: '主計總處人力資源調查', url: 'https://data.gov.tw/dataset/6640', national: unempLatest.national });
for (const c of COUNTIES) items[c].unemployment = unempLatest.values[c] ?? null;

/* ---------- 財政：歲入、歲出決算（國發會彙編）、公共債務（國庫署） ---------- */

const ndcCsv = async (url) => {
  const [header, ...rows] = (await (await fetchRetry(url)).text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
};
const rev = await ndcCsv('https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82Mzk2LzYxMTFhZDNmLTZkMmUtNGUxMC05OGRlLTQzNGE0YzgxM2U4My5jc3Y%3d&n=OC0xIOatsuWFpS5jc3Y%3d&icon=.csv');
const exp = await ndcCsv('https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82Mzk2L2UxZTliZGQ2LTQyNWYtNGYwYS1iN2E3LTY3OGNhYWE0MzRlYy5jc3Y%3d&n=OC0yIOatsuWHui5jc3Y%3d&icon=.csv');
const fiscalYear = rev[0]['年'];
const revOf = (c) => rev.find((r) => r['地區'] === c);
const expOf = (c) => exp.find((r) => r['地區'] === c);
// 自有財源＝歲入－補助及協助收入（單位百萬元）。以歲出當分母時臺北市會超過 100%（2024 歲入 2,228 億、歲出 1,587 億），
// 跟官方「自有財源比率」對不起來，所以用定義明確的「占歲入比率」
const ownRevenue = (c) => Number(revOf(c)['合計實數']) - Number(revOf(c)['補助及協助收入實數']);
const fiscal = { category: '財政', period: `${fiscalYear} 年度決算`, source: '國發會都市及區域發展統計彙編（各縣市歲入、歲出決算）', url: 'https://data.gov.tw/dataset/6518' };
fields.push(
  { key: 'own_revenue_ratio', label: '自有財源占歲入比率', unit: '%', ...fiscal, national: share(sumAll(ownRevenue), sumAll((c) => Number(revOf(c)['合計實數']))) },
  { key: 'expenditure_per_capita', label: '每人歲出', unit: '元', ...fiscal, national: Math.round((sumAll((c) => Number(expOf(c)['合計實數'])) * 1e6) / allTotal) },
);
for (const c of COUNTIES) {
  if (!revOf(c) || !expOf(c)) continue;
  items[c].own_revenue_ratio = share(ownRevenue(c), Number(revOf(c)['合計實數']));
  items[c].expenditure_per_capita = Math.round((Number(expOf(c)['合計實數']) * 1e6) / total(c));
}
// 公共債務（1 年以上＋未滿 1 年，百萬元）；比率欄直轄市與縣市分母不同（GDP vs 歲出），只取金額換算每人負債
const debtRows = (await (await fetchRetry('https://lgd.nta.gov.tw/newlgd/opendata/D3-09.csv')).text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
const debtYears = [...new Set(debtRows.slice(1).map((r) => r[0]))].sort();
const debtOf = (year, c) => { const r = debtRows.find((x) => x[0] === year && x[1] === c); return r ? Number(r[6]) : null; };
const debtYear = debtYears.at(-1);
fields.push(
  { key: 'debt', label: '公共債務餘額', unit: '百萬元', category: '財政', period: `${Number(debtYear) + 1911} 年度`, source: '財政部國庫署歷年各級政府債務概況', url: 'https://data.gov.tw/dataset/25301' },
  { key: 'debt_per_capita', label: '每人負債', unit: '元', category: '財政', period: `${Number(debtYear) + 1911} 年度`, source: '財政部國庫署歷年各級政府債務概況', url: 'https://data.gov.tw/dataset/25301',
    national: Math.round((sumAll((c) => debtOf(debtYear, c) ?? 0) * 1e6) / allTotal) },
);
for (const c of COUNTIES) {
  items[c].debt = debtOf(debtYear, c);
  items[c].debt_per_capita = items[c].debt === null ? null : Math.round((items[c].debt * 1e6) / total(c));
}
trends.debt = { label: '公共債務餘額', unit: '百萬元', points: debtYears.slice(-10).map((y) => ({ period: String(Number(y) + 1911), values: Object.fromEntries(COUNTIES.map((c) => [c, debtOf(y, c)])) })) };

/* ---------- 用電量：台電各縣市住宅、服務業及機關用電統計（每月，2016 起；四類加總＝總用電） ---------- */

const elecCsv = (await (await fetchRetry('https://service.taipower.com.tw/data/opendata/apply/file/d007012/001.csv')).text()).replace(/^﻿/, '');
// 售電量有千分位逗號與引號（"636,471,432"），不能直接切逗號
const elecRows = elecCsv.split(/\r?\n/).slice(1).map((l) => [...l.matchAll(/("([^"]*)"|[^,]*)(,|$)/g)].map((m) => m[2] ?? m[1])).filter((r) => /^\d{5}$/.test(r[0]));
const elec = new Map(); // 'YYYMM' → 縣市 → { 用電性質: 度 }
for (const [ym, rawCounty, kind, kwh] of elecRows) {
  const county = rawCounty.replace(/台/g, '臺');
  if (!items[county]) continue;
  const byCounty = elec.get(ym) ?? new Map();
  const k = byCounty.get(county) ?? {};
  k[kind] = (k[kind] ?? 0) + Number(kwh.replace(/,/g, ''));
  byCounty.set(county, k);
  elec.set(ym, byCounty);
}
const elecMonths = [...elec.keys()].sort();
const last12 = elecMonths.slice(-12);
const prev12 = elecMonths.slice(-24, -12);
const elecSum = (months, c, kind) => months.reduce((s, ym) => {
  const k = elec.get(ym)?.get(c) ?? {};
  return s + (kind ? k[kind] ?? 0 : Object.values(k).reduce((t, v) => t + v, 0));
}, 0);
const rocToIso = (ym) => `${Number(ym.slice(0, 3)) + 1911}-${ym.slice(3)}`;
const elecMeta = { category: '能源', period: `${rocToIso(last12[0])}～${rocToIso(last12.at(-1))}（近 12 個月）`, source: '台電各縣市住宅、服務業及機關用電統計', url: 'https://data.gov.tw/dataset/29935' };
const elecAll = (months, kind) => COUNTIES.reduce((s, c) => s + elecSum(months, c, kind), 0);
fields.push(
  { key: 'elec_total', label: '總用電量', unit: '百萬度', ...elecMeta },
  { key: 'elec_per_capita', label: '每人用電量', unit: '度／人', ...elecMeta, national: Math.round(elecAll(last12) / allTotal) },
  { key: 'elec_residential_per_capita', label: '每人住宅用電量', unit: '度／人', ...elecMeta, national: Math.round(elecAll(last12, '住宅') / allTotal) },
  { key: 'elec_industry_share', label: '工業用電占比', unit: '%', ...elecMeta, national: share(elecAll(last12, '工業'), elecAll(last12)) },
  { key: 'elec_growth', label: '用電量年增率', unit: '%', ...elecMeta, national: share(elecAll(last12) - elecAll(prev12), elecAll(prev12)) },
);
for (const c of COUNTIES) {
  const t = elecSum(last12, c);
  items[c].elec_total = Math.round(t / 1e6);
  items[c].elec_per_capita = Math.round(t / total(c));
  items[c].elec_residential_per_capita = Math.round(elecSum(last12, c, '住宅') / total(c));
  items[c].elec_industry_share = share(elecSum(last12, c, '工業'), t);
  items[c].elec_growth = share(t - elecSum(prev12, c), elecSum(prev12, c));
}
// 歷年總用電量（只取 12 個月都有的曆年）
const elecYears = [...new Set(elecMonths.map((ym) => ym.slice(0, 3)))].filter((y) => elecMonths.filter((ym) => ym.startsWith(y)).length === 12);
trends.electricity = { label: '總用電量（百萬度）', unit: '百萬度', points: elecYears.slice(-10).map((y) => {
  const months = elecMonths.filter((ym) => ym.startsWith(y));
  return { period: String(Number(y) + 1911), values: Object.fromEntries(COUNTIES.map((c) => [c, Math.round(elecSum(months, c) / 1e6)])) };
}) };

/* ---------- 產業、就業、原住民、學校 ---------- */

/** data.gov.tw 資料集的最新一份資源（依說明或網址排序取最後；pick 可篩格式） */
async function latestResource(id, pick = () => true) {
  const r = (await (await fetchRetry(`https://data.gov.tw/api/v2/rest/dataset/${id}`)).json()).result;
  const list = r.distribution.filter(pick).sort((a, b) => `${a.resourceDescription}${a.resourceDownloadUrl}`.localeCompare(`${b.resourceDescription}${b.resourceDownloadUrl}`));
  return list.at(-1);
}
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
