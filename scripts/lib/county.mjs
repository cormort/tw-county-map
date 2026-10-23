/**
 * 縣市共通資料與純函式。所有來源模組共用這一組，不要在別的地方另外造一份縣市清單。
 */

/** 22 個縣市（含離島），順序就是網站上的顯示順序 */
export const COUNTIES = ['基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];

/** 實價登錄檔名的縣市代碼 */
export const LVR = { a: '臺北市', b: '臺中市', c: '基隆市', d: '臺南市', e: '高雄市', f: '新北市', g: '宜蘭縣', h: '桃園市', i: '嘉義市',
  j: '新竹縣', k: '苗栗縣', m: '南投縣', n: '彰化縣', o: '新竹市', p: '雲林縣', q: '嘉義縣', t: '屏東縣', u: '花蓮縣', v: '臺東縣',
  w: '金門縣', x: '澎湖縣', z: '連江縣' };
/** 農業部資料的地區代碼 */
export const MOA = { 65000: '新北市', 63000: '臺北市', 68000: '桃園市', 66000: '臺中市', 67000: '臺南市', 64000: '高雄市', 10002: '宜蘭縣',
  10004: '新竹縣', 10005: '苗栗縣', 10007: '彰化縣', 10008: '南投縣', 10009: '雲林縣', 10010: '嘉義縣', 10013: '屏東縣', 10014: '臺東縣',
  10015: '花蓮縣', 10016: '澎湖縣', 10017: '基隆市', 10018: '新竹市', 10020: '嘉義市', '09020': '金門縣', '09007': '連江縣' };

export const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
export const per10k = (part, pop) => round((part / pop) * 10000, 2);

export const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};

export const monthsBack = (n) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export const rocToIso = (ym) => `${Number(ym.slice(0, 3)) + 1911}-${ym.slice(3)}`;

/** 切一列 CSV（處理雙引號欄位） */
export const csvLine = (l) => [...l.matchAll(/("([^"]*)"|[^,]*)(,|$)/g)].slice(0, -1).map((m) => m[2] ?? m[1]);
export const normCounty = (name) => name.replace(/^\[\d+\]/, '').replace(/台/g, '臺').trim();
