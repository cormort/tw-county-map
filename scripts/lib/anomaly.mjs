/**
 * 數值異常偵測：上游改格式、改單位、或某一欄突然抓錯時，最常見的症狀是「數字整體跳一個數量級」。
 * 這裡用中位數判斷（不是平均），所以單一縣市飆高不會誤判。
 *
 * 規則：可比較的縣市至少 `minCounties` 個，且各縣市相對變動的中位數 > `threshold` → 視為異常。
 * 判定異常時呼叫端（runner）會**沿用上一版的數值**並告知，不要把可疑數字寫進網站。
 */

/** 中位數（空陣列回 null） */
export function medianOf(xs) {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
}

/**
 * 比較同一欄位的前後版本。
 *
 * @param {Record<string, number|null|undefined>} prev 上一版（縣市 → 值）
 * @param {Record<string, number|null|undefined>} next 這一次（縣市 → 值）
 * @param {{ threshold?: number, minCounties?: number }} [options]
 * @returns {{ anomaly: boolean, medianChange: number|null, compared: number, counties: string[] }}
 *   medianChange 是「相對變動的中位數」（0.5 = 一半），counties 是變動最大的前 5 個縣市（給通知用）
 */
export function detectAnomaly(prev, next, { threshold = 0.4, minCounties = 5 } = {}) {
  const changes = [];
  for (const [county, value] of Object.entries(next ?? {})) {
    const before = prev?.[county];
    if (typeof value !== 'number' || !Number.isFinite(value)) continue;
    if (typeof before !== 'number' || !Number.isFinite(before) || before === 0) continue;
    changes.push({ county, change: Math.abs(value - before) / Math.abs(before) });
  }
  const medianChange = medianOf(changes.map((x) => x.change));
  const counties = changes
    .sort((a, b) => b.change - a.change)
    .slice(0, 5)
    .map((x) => `${x.county} ${(x.change * 100).toFixed(0)}%`);
  return {
    anomaly: changes.length >= minCounties && medianChange !== null && medianChange > threshold,
    medianChange,
    compared: changes.length,
    counties,
  };
}

/** 從資料檔的 items 取出某一欄的「縣市 → 值」 */
export function valuesOf(items, key) {
  return Object.fromEntries(
    Object.entries(items ?? {}).map(([county, row]) => [county, row?.[key]]),
  );
}
