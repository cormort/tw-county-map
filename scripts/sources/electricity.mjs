/**
 * 用電量（台電各縣市住宅、服務業及機關用電統計，每月）。四類加總＝總用電。
 * 售電量欄位有千分位逗號與引號（"636,471,432"），不能直接切逗號。
 */
import { COUNTIES, rocToIso } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';

export const id = 'electricity';
export const name = '用電量（台電縣市別）';
export const provides = ['elec_total', 'elec_per_capita', 'elec_residential_per_capita', 'elec_industry_share', 'elec_growth'];
export const dependsOn = ['population'];

export async function collect({ items, fields, shared }) {
  const { total, allTotal, share } = shared.population;
  const trends = {};
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
  return { trends };
}
