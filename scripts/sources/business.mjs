/**
 * 公司登記（data.gov.tw/9346）與商業登記（25346）：商工行政資料開放平臺，每月更新。
 * 縣市列前面有縮排空白，靠 csvLine＋normCounty 清乾淨。
 * 每千人分母用同月戶籍人口（population 模組）。
 */
import { COUNTIES, csvLine, normCounty, perMille } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';
import { latestResource } from '../lib/datagov.mjs';

export const id = 'business';
export const name = '公司與商業登記（商工行政）';
export const provides = ['companies', 'companies_per1000', 'company_capital', 'businesses', 'businesses_per1000'];
export const dependsOn = ['population'];

export async function collect({ items, fields, download, shared }) {
  const { total, allTotal, sumAll } = shared.population;
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
  }}
