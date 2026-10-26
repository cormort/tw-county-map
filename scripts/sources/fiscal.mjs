/**
 * 財政：歲入、歲出決算（國發會彙編）、公共債務（財政部國庫署）。
 *
 * 自有財源＝歲入－補助及協助收入。以歲出當分母時臺北市會超過 100%（2024 歲入 2,228 億、歲出 1,587 億），
 * 跟官方「自有財源比率」對不起來，所以用定義明確的「占歲入比率」。
 * 債務比率欄直轄市與縣市分母不同（GDP vs 歲出），只取金額換算每人負債。
 */
import { COUNTIES } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';

export const id = 'fiscal';
export const name = '財政（國發會歲入歲出＋國庫署債務）';
export const provides = ['own_revenue_ratio', 'expenditure_per_capita', 'tax_revenue', 'tax_revenue_ratio', 'tax_revenue_per_capita', 'debt', 'debt_per_capita'];
export const dependsOn = ['population'];

/** 國發會彙編 CSV → 一列一個物件（欄名取自第一列；單位百萬元） */
export function parseNdcCsv(text) {
  const [header, ...rows] = text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
}

/** 國庫署 D3-09 CSV → 原始列的陣列（第 0 欄年度、第 1 欄縣市、第 6 欄債務餘額） */
export function parseDebtRows(text) {
  return text.replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
}

export async function collect({ items, fields, shared }) {
  const { total, allTotal, share, sumAll } = shared.population;
  const trends = {};
  const ndcCsv = async (url) => parseNdcCsv(await (await fetchRetry(url)).text());
  const rev = await ndcCsv('https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82Mzk2LzYxMTFhZDNmLTZkMmUtNGUxMC05OGRlLTQzNGE0YzgxM2U4My5jc3Y%3d&n=OC0xIOatsuWFpS5jc3Y%3d&icon=.csv');
  const exp = await ndcCsv('https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82Mzk2L2UxZTliZGQ2LTQyNWYtNGYwYS1iN2E3LTY3OGNhYWE0MzRlYy5jc3Y%3d&n=OC0yIOatsuWHui5jc3Y%3d&icon=.csv');
  const fiscalYear = rev[0]['年'];
  const revOf = (c) => rev.find((r) => r['地區'] === c);
  const expOf = (c) => exp.find((r) => r['地區'] === c);
  // 自有財源＝歲入－補助及協助收入（單位百萬元）。以歲出當分母時臺北市會超過 100%（2024 歲入 2,228 億、歲出 1,587 億），
  // 跟官方「自有財源比率」對不起來，所以用定義明確的「占歲入比率」
  const ownRevenue = (c) => Number(revOf(c)['合計實數']) - Number(revOf(c)['補助及協助收入實數']);
  const taxRevenue = (c) => Number(revOf(c)['稅課收入實數']);
  const fiscal = { category: '財政', period: `${fiscalYear} 年度決算`, source: '國發會都市及區域發展統計彙編（各縣市歲入、歲出決算）', url: 'https://data.gov.tw/dataset/6518' };
  fields.push(
    { key: 'own_revenue_ratio', label: '自有財源占歲入比率', unit: '%', ...fiscal, national: share(sumAll(ownRevenue), sumAll((c) => Number(revOf(c)['合計實數']))) },
    { key: 'expenditure_per_capita', label: '每人歲出', unit: '元', ...fiscal, national: Math.round((sumAll((c) => Number(expOf(c)['合計實數'])) * 1e6) / allTotal) },
    { key: 'tax_revenue', label: '地方稅課收入', unit: '百萬元', ...fiscal, national: Math.round(sumAll(taxRevenue)) },
    { key: 'tax_revenue_ratio', label: '地方稅占歲入比率', unit: '%', digits: 1, ...fiscal, national: share(sumAll(taxRevenue), sumAll((c) => Number(revOf(c)['合計實數']))) },
    { key: 'tax_revenue_per_capita', label: '平均每人地方稅負', unit: '元', ...fiscal, national: Math.round((sumAll(taxRevenue) * 1e6) / allTotal) },
  );
  for (const c of COUNTIES) {
    if (!revOf(c) || !expOf(c)) continue;
    items[c].own_revenue_ratio = share(ownRevenue(c), Number(revOf(c)['合計實數']));
    items[c].expenditure_per_capita = Math.round((Number(expOf(c)['合計實數']) * 1e6) / total(c));
    items[c].tax_revenue = Math.round(taxRevenue(c));
    items[c].tax_revenue_ratio = share(taxRevenue(c), Number(revOf(c)['合計實數']));
    items[c].tax_revenue_per_capita = Math.round((taxRevenue(c) * 1e6) / total(c));
  }
  // 公共債務（1 年以上＋未滿 1 年，百萬元）；比率欄直轄市與縣市分母不同（GDP vs 歲出），只取金額換算每人負債
  const debtRows = parseDebtRows(await (await fetchRetry('https://lgd.nta.gov.tw/newlgd/opendata/D3-09.csv')).text());
  const debtYears = [...new Set(debtRows.slice(1).map((r) => r[0]))].sort();
  const debtOf = (year, c) => { const r = debtRows.find((x) => x[0] === year && x[1] === c); return r ? Number(r[6]) : null; };
  const debtYear = debtYears.at(-1);
  fields.push(
    { key: 'debt', label: '公共債務餘額', unit: '百萬元', category: '財政', period: `${Number(debtYear) + 1911} 年度`, source: '財政部國庫署歷年各級政府債務概況', url: 'https://data.gov.tw/dataset/25301' },
    { key: 'debt_per_capita', label: '每人負債', unit: '元', category: '財政', period: `${Number(debtYear) + 1911} 年度`, source: '財政部國庫署歷年各級政府債務概況', url: 'https://data.gov.tw/dataset/25301',
      national: Math.round((sumAll((c) => debtOf(debtYear, c) ?? 0) * 1e6) / allTotal) },
  );
  for (const c of COUNTIES) {
    items[c].debt = debtOf(debtYear, c);
    items[c].debt_per_capita = items[c].debt === null ? null : Math.round((items[c].debt * 1e6) / total(c));
  }
  trends.debt = { label: '公共債務餘額', unit: '百萬元', points: debtYears.slice(-10).map((y) => ({ period: String(Number(y) + 1911), values: Object.fromEntries(COUNTIES.map((c) => [c, debtOf(y, c)])) })) };
  return { trends };
}
