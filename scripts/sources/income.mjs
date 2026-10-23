/**
 * 所得與失業率（主計總處），順便算房價所得比。
 *
 * 房價所得比＝住宅成交總價中位數 ÷ 平均每戶可支配所得。官方用中位數所得，這裡只有平均數，
 * 所以數字會比官方低一些（欄位說明有寫）。
 * 金門、連江不在家庭收支調查範圍，所得與房價所得比是 null。
 * 失業率只取已過完的完整年度（表裡也有半年列）。
 */
import { COUNTIES, median, round } from '../lib/county.mjs';
import { fetchDgbas } from '../lib/dgbas.mjs';

export const id = 'income';
export const name = '所得、失業率（主計總處）';
export const provides = ['income', 'price_to_income', 'unemployment'];
export const dependsOn = ['population', 'house-price']; // 人口：縣市清單；房價：成交總價

export async function collect({ items, fields, shared }) {
  const { totals, meta: lvr } = shared['house-price'];
  const now = new Date();
  const trends = {};
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
  return { trends };
}
