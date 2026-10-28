/**
 * 內政部統計查詢網「外籍與大陸港澳配偶人數」CSV 解析。
 *
 * 為什麼要單獨一支：上游在當月還沒發布時，**會回一列全是 "-" 的空殼**（實測 115年9月），
 * 以前把 "-" 當 0 讀，於是 22 個縣市全部變 0，觸發異常偵測（中位數變動 100%）。
 * 這裡把「沒資料」和「真的是 0」分開：`-` → null，並用 hasData 告訴呼叫端要不要換月份重抓。
 */

const ROW = /^"(\d+)年 \((\d+)~\d+月\)\/ (\S+)\/ 性別總計",(.*)$/;

const num = (s) => {
  const t = String(s ?? '').trim().replace(/,/g, '');
  if (t === '' || t === '-' || t === '—') return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

/**
 * @param {string} text CSV 全文
 * @returns {{period: string|null, hasData: boolean, byCounty: Record<string, {total:number, foreign:number, mainland:number}>}}
 *   period 形如 `2026-09`；hasData 為 false 代表該月還沒發布（整月皆 `-`）。
 */
export function parseSpouseCsv(text) {
  const byCounty = {};
  let period = null;
  for (const line of String(text ?? '').split(/\r?\n/)) {
    const m = line.match(ROW);
    if (!m) continue;
    const [, rocYear, month, county, rest] = m;
    const v = rest.split(',');
    // 欄位順序：總計, 外籍配偶, 越南…其他(9), 大陸配偶, 港澳配偶
    const total = num(v[0]);
    const foreign = num(v[1]);
    const mainland = (num(v[10]) ?? null) === null && (num(v[11]) ?? null) === null
      ? null
      : (num(v[10]) ?? 0) + (num(v[11]) ?? 0);
    if (total === null && foreign === null && mainland === null) continue; // 空殼列，不算有資料
    byCounty[county] = { total, foreign, mainland };
    if (!period) period = `${Number(rocYear) + 1911}-${String(month).padStart(2, '0')}`;
  }
  return { period, hasData: Object.keys(byCounty).length > 0, byCounty };
}
