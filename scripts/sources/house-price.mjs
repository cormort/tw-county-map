/**
 * 房價與成交量（內政部實價登錄，最近四季）。季別要跟著往後推：SEASONS。
 * 只算有房子的買賣（排除純土地、純車位），房價只看「住家用」且排除親友等異常交易。
 *
 * `shared.totals` 是各縣市住宅成交總價、`shared.meta` 是欄位共用的期間／來源說明，
 * 房價所得比（所得模組）兩者都要用。
 */
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { COUNTIES, LVR, median, per10k, round } from '../lib/county.mjs';
import { extractZip } from '../lib/download.mjs';

export const id = 'house-price';
export const name = '房價、成交量（實價登錄）';
export const provides = ['house_price', 'house_deals', 'house_deals_per10k'];
export const dependsOn = ['medical']; // 每萬人件數的分母用年報的年底人口

const PING = 3.305785; // 1 坪 = 3.305785 m²
const SEASONS = ['114S4', '115S1', '115S2', '115S3'];

/**
 * 實價登錄單一縣市的 CSV → { deals, prices（萬元／坪）, totals（元） }。
 *
 * 規則（都是業務判斷，改之前先想清楚）：
 * - 交易標的含「建物」才算有房子的買賣 → 排除純土地、純車位
 * - 房價只看「住家用」，並排除親友／特殊關係／員工／瑕疵／急買急賣／毛胚
 * - 被排除的列仍然算「成交件數」（deals），因為它們確實是買賣
 * - 第二列是英文欄名，要跳過
 * ponytail: 實價登錄 CSV 沒有引號欄位，直接切逗號；哪天出現引號再換 parser
 */
export function parseLvrRows(csv, { ping = PING } = {}) {
  const [header, , ...rows] = csv.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  const col = Object.fromEntries(header.split(',').map((h, i) => [h, i]));
  const out = { deals: 0, prices: [], totals: [] };
  for (const row of rows) {
    const r = row.split(',');
    if (!r[col['交易標的']]?.includes('建物')) continue;
    out.deals += 1;
    const unitPrice = Number(r[col['單價元平方公尺']]);
    if (r[col['主要用途']] !== '住家用' || !(unitPrice > 0) || /親友|特殊|員工|瑕疵|急買急賣|毛胚/.test(r[col['備註']] ?? '')) continue;
    out.prices.push((unitPrice * ping) / 10000);
    out.totals.push(Number(r[col['總價元']]));
  }
  return out;
}

export async function collect({ items, fields, download, shared, tmp }) {
  const { pop, totalPop } = shared.medical;
  const prices = Object.fromEntries(COUNTIES.map((c) => [c, []]));
  const totals = Object.fromEntries(COUNTIES.map((c) => [c, []])); // 住宅成交總價（元），算房價所得比
  const deals = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
  for (const season of SEASONS) {
    const zip = await download(`https://plvr.land.moi.gov.tw/DownloadSeason?season=${season}&type=zip&fileName=lvr_landcsv.zip`, `${season}.zip`);
    // 整季解到暫存目錄再一次讀，不要用 `unzip -p` 接 stdout（Windows 沙箱環境 spawn 管線會 EPERM）
    const seasonDir = join(tmp, `lvr-${season}`);
    await extractZip(zip, seasonDir);
    for (const [code, county] of Object.entries(LVR)) {
      let csv;
      try {
        csv = await readFile(join(seasonDir, `${code}_lvr_land_a.csv`), 'utf8');
      } catch {
        continue; // 該季該縣市沒有檔案
      }
      const parsed = parseLvrRows(csv);
      deals[county] += parsed.deals;
      prices[county].push(...parsed.prices);
      totals[county].push(...parsed.totals);
    }
  }
  const median = (xs) => {
    const s = [...xs].sort((a, b) => a - b);
    return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
  };
  const lvr = { category: '房價', period: `近四季申報：${SEASONS.map((x) => `${x.slice(0, 3)} 年 Q${x.at(-1)}`).filter((_, i, a) => !i || i === a.length - 1).join('–')}`, source: '內政部實價登錄', url: 'https://plvr.land.moi.gov.tw/DownloadOpenData' };
  fields.push(
    { key: 'house_price', label: '住宅成交單價中位數', unit: '萬元／坪', digits: 1, ...lvr, national: round(median(Object.values(prices).flat())) },
    { key: 'house_deals', label: '房屋買賣件數', unit: '件', ...lvr },
    { key: 'house_deals_per10k', label: '每萬人房屋買賣件數', unit: '件／萬人', digits: 1, ...lvr, national: per10k(Object.values(deals).reduce((s, n) => s + n, 0), totalPop) },
  );
  for (const c of COUNTIES) {
    const m = median(prices[c]);
    items[c].house_price = m === null ? null : round(m);
    items[c].house_deals = deals[c];
    items[c].house_deals_per10k = per10k(deals[c], pop(c));
  }
  return { shared: { totals, meta: lvr } };
}
