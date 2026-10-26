/**
 * 歷史年度人口：public/data/population-trend.json 的月別戶籍人口（2016-01 起）。
 *
 * 「每人」指標的分子分母要同一時點：2024 年度決算、2025 年度債務／勞保／光電，
 * 分母要用 2024-12、2025-12 的戶籍人口，不是網站其他地方用的最新月人口
 * （用最新月人口會讓舊年度的每人值被高估或低估 1–3%）。
 *
 * 這個檔案由快照管線（scripts/snapshot.mjs）產生，不屬於 county-stats.mjs；
 * 找不到指定月份就丟錯，不要靜默改用其他月份的人口。
 */
import { readFile } from 'node:fs/promises';
import { COUNTIES } from './county.mjs';

const TREND = new URL('../../public/data/population-trend.json', import.meta.url);
let cache;

async function load() {
  cache ??= JSON.parse(await readFile(TREND, 'utf8'));
  return cache;
}

/**
 * 指定月底（`YYYY-MM`）的 22 縣市戶籍人口。
 * @param {string} ym 例如 `2024-12`
 * @returns {Promise<Record<string, number>>}
 */
export async function populationAt(ym) {
  const trend = await load();
  const index = trend.months?.indexOf(ym) ?? -1;
  if (index < 0) {
    const range = `${trend.months?.[0] ?? '?'}～${trend.months?.at(-1) ?? '?'}`;
    throw new Error(`population-trend.json 沒有 ${ym} 的人口（${range}）`);
  }
  const out = {};
  for (const county of COUNTIES) {
    const row = trend.counties?.find((x) => x.county === county);
    if (!row?.monthly) throw new Error(`population-trend.json 缺 ${county} 的月別人口`);
    out[county] = row.monthly[index];
  }
  return out;
}

/** 指定年度年底（`YYYY-12`）的人口；年度制統計（決算、年度債務）用這個當分母 */
export const yearEndPopulation = (year) => populationAt(`${year}-12`);
