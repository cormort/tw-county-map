/**
 * 長照 ABC 據點（衛福部，每日更新）。同一機構每個特約服務各一列，用機構代碼去重。
 * ponytail: 不分 A/B/C —— 臺北市在這份檔案裡一個 C 據點都沒有，C 據點顯然沒完整登錄。
 */
import { COUNTIES, MOA } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';

export const id = 'care';
export const name = '長照據點（衛福部 ABC）';
export const provides = ['ltc_points', 'ltc_per1000_elderly'];
export const dependsOn = ['population'];

export async function collect({ items, fields, shared }) {
  const { ages, elderlyOf, perMille, sumAll } = shared.population;
  // 2026-11 起 /publish/abc.csv 回 404（HTML 錯誤頁）且 data.gov.tw 中介資料還指著舊網址；
  // requireOk 讓 404 走「重試 → 用 11/04 的快取」並標進 meta.stale_sources，而不是解析錯誤頁得到 0。
  const res = await fetchRetry('https://ltcpap.mohw.gov.tw/publish/abc.csv', { requireOk: true });
  const ltcCsv = await res.text();
  if (!ltcCsv.includes('機構代碼')) throw new Error('回應不是 ABC 據點 CSV（錯誤頁或格式改了）');
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
}
