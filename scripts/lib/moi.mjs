/**
 * 內政部資料（kiang 轉存的村里 CSV）。戶政司的單一年齡人口、出生死亡都走這裡。
 *
 * 檔名格式：`<KIANG>/<kind>/<YYYY>/<MM>/data.csv`（kind = population｜bdmd）。
 */
import { COUNTIES } from './county.mjs';
import { fetchRetry } from './fetch-cache.mjs';

const KIANG = 'https://raw.githubusercontent.com/kiang/data.moi.gov.tw/master/raw';

/** 讀村里 CSV，依「區域別」前三字加總到縣市；回傳 縣市 → 欄名 → 合計（該月沒檔案回 null） */
export async function villageCsv(kind, ym) {
  const res = await fetchRetry(`${KIANG}/${kind}/${ym}/data.csv`);
  if (!res.ok) return null;
  return parseVillageCsv(await res.text());
}

/**
 * 村里 CSV → 縣市 → 欄名 → 合計。
 *
 * - 2024 年中以前的檔案是英文欄名（birth_total、people_age_000_m…），統一成中文
 * - 村里列用「區域別」前 3 字歸到縣市（例如「臺北市大安區…」）
 * - ponytail: 這兩份 CSV 沒有引號欄位，直接切逗號
 */
export function parseVillageCsv(text) {
  const [header, ...rows] = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const cols = header.split(',').map((h) => {
    const age = h.match(/^people_age_(\d{3}|100up)_([mf])$/);
    if (age) return `${age[1] === '100up' ? '100歲以上' : `${Number(age[1])}歲`}-${age[2] === 'm' ? '男' : '女'}`;
    return { birth_total: '出生數', death_total: '死亡數', people_total: '人口數', people_total_m: '人口數-男', people_total_f: '人口數-女' }[h] ?? h;
  });
  const sums = Object.fromEntries(COUNTIES.map((c) => [c, {}]));
  for (const row of rows) {
    const r = row.split(',');
    const county = sums[r[2]?.slice(0, 3)];
    if (!county) continue; // 第二列英文欄名
    cols.forEach((col, i) => { if (i > 3) county[col] = (county[col] ?? 0) + Number(r[i]); });
  }
  return sums;
}
