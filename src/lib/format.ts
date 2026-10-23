/** 數字格式與比率計算：全站共用，缺值一律是 null（顯示破折號），不要讓 NaN／Infinity 流進色階與表格 */

// county-stats.json 的指標自帶單位（家、床、萬元／坪…），所以開放成字串
export type Unit = '人' | '戶' | '%' | '票' | '百分點' | '平方公里' | '人／平方公里' | (string & {});

export const num = (n: number, digits = 0) => n.toLocaleString('zh-TW', { maximumFractionDigits: digits, minimumFractionDigits: digits });
export const numOrDash = (n: number | null, digits = 0) => (n === null || !Number.isFinite(n) ? '—' : num(n, digits));
export const signed = (value: number, digits = 0) => `${value > 0 ? '+' : ''}${num(value, digits)}`;

/** whole 為 0 或缺值時回 null（＝「無資料」） */
export const ratio = (part: number, whole: number) => (Number.isFinite(part) && Number.isFinite(whole) && whole !== 0 ? (part / whole) * 100 : null);
export const sumBy = <T,>(items: T[], f: (c: T) => number) => items.reduce((t, c) => t + f(c), 0);

/** 人口密度（人/km²）：面積缺值或 0 時回 null */
export const perArea = (population: number, area: number | null | undefined) =>
  Number.isFinite(population) && Number.isFinite(area) && (area ?? 0) > 0 ? Math.round((population / (area as number)) * 10) / 10 : null;

export const isRate = (unit: Unit) => unit === '%' || unit === '百分點';
/** 比率、每千人、倍數這類「不能加總」的單位 */
export const RATE_UNIT = /%|‰|百分點|／|倍/;

export const fmt = (value: number | null, unit: Unit, digits = 0) =>
  value === null ? '—' : isRate(unit) ? `${num(value, 2)}${unit === '%' ? '%' : ' 個百分點'}` : `${num(value, digits)} ${unit}`;
