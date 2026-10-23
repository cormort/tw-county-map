/**
 * 各級學校數（教育部統計處各級學校名錄）。多學年度合在一個檔的只取最新學年度。
 * 最後一欄「平均每所國小的學齡兒童數」＝ 6–11 歲人口 ÷ 國小數，人口從 population 模組拿。
 *
 * 2026-10 這支來源曾經整個連線逾時（stats.moe.gov.tw）；那時 80 個指標一起陣亡，
 * 現在它一個模組，壞了只影響這 6 個教育指標。
 */
import { COUNTIES, csvLine, normCounty } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';
import { latestResource } from '../lib/datagov.mjs';

export const id = 'education';
export const name = '教育（教育部各級學校名錄）';
export const provides = ['schools_kindergarten', 'schools_primary', 'schools_junior', 'schools_senior', 'schools_college', 'pupils_per_primary_school'];
export const dependsOn = ['population'];

/** 名錄 CSV（已切好的列）→ 最新學年度的各縣市學校數；一個檔可能含多個學年度 */
export function parseSchoolRows(rows) {
  const col = rows[0].indexOf('縣市名稱');
  if (col < 0) throw new Error('學校名錄沒有「縣市名稱」欄，格式變了');
  const year = rows.slice(1).reduce((m, r) => Math.max(m, Number(r[0]) || 0), 0);
  const out = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
  for (const r of rows.slice(1)) { const c = normCounty(r[col] ?? ''); if (Number(r[0]) === year && c in out) out[c] += 1; }
  return { year, out };
}

export async function collect({ items, fields, download, shared }) {
  const { ageSum, popPeriod, sumAll } = shared.population;
  // 學校數（教育部統計處各級學校名錄；多學年度合在一個檔的只取最新學年度）
  async function schoolCount(url) {
    const rows = (await (await fetchRetry(url)).text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(csvLine);
    return parseSchoolRows(rows);
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
  for (const c of COUNTIES) items[c].pupils_per_primary_school = primaryCount.out[c] ? Math.round(ageSum(c, 6, 11) / primaryCount.out[c]) : null;}
