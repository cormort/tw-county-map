/**
 * 歷年趨勢：出生數、65 歲以上比率（近 5 個完整年度，戶政司村里資料加總）。
 * 這兩個是縣市總覽趨勢線的基礎，抓不到就整支失敗（不要畫半條線）。
 */
import { COUNTIES } from '../lib/county.mjs';
import { villageCsv } from '../lib/moi.mjs';

export const id = 'population-trends';
export const name = '歷年趨勢（出生數、老年比率）';
export const provides = []; // 只產出 trends（歷年趨勢），不新增指標欄位
export const dependsOn = ['population'];

export async function collect({ items, fields, download, shared }) {
  const { ages, share, elderlyOf } = shared.population;
  const now = new Date();
  const trends = {};
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
  }  return { trends };
}
