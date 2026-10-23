/**
 * 耕地面積（農業部開放資料，data.gov.tw/dataset/94988），取最新年度。
 * cultivated_area 是「耕地佔土地面積 %」，公頃數要把五類加總。
 */
import { COUNTIES, MOA } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';

export const id = 'farmland';
export const name = '農地（農業部）';
export const provides = ['farmland', 'farmland_ratio'];
export const dependsOn = [];

const FARM = 'https://data.moa.gov.tw/Service/OpenData/TransService.aspx?UnitId=TtusYV8k5Wz8&IsTransData=1';

export async function collect({ items, fields }) {
  const farm = await (await fetchRetry(FARM)).json();
  const year = Math.max(...farm.map((r) => Number(r.year)));
  // cultivated_area 其實是「耕地佔土地面積 %」，公頃數要把五類加總（台中 112 年 ≈ 47,520 公頃，與市府年報相符）
  const PARTS = ['rice', 'short_norice', 'short_leisure', 'long_farm', 'long_leisure'];
  const moa = { category: '農業', period: `${year} 年`, source: '農業部農耕土地面積', url: 'https://data.gov.tw/dataset/94988' };
  fields.push(
    { key: 'farmland', label: '耕地面積', unit: '公頃', ...moa },
    { key: 'farmland_ratio', label: '耕地佔土地面積比率', unit: '%', ...moa },
  );
  for (const r of farm.filter((r) => Number(r.year) === year)) {
    const county = MOA[r.county_code];
    if (!county) continue; // 「台灣省」小計
    const ha = Math.round(PARTS.reduce((s, k) => s + Number(r[k]), 0));
    // 連江縣各欄全是 0：比較像沒填報，當作無資料，不要在排行榜墊底
    items[county].farmland = ha || null;
    items[county].farmland_ratio = ha ? Number(r.cultivated_area) : null;
  }
}
