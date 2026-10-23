/**
 * 勞保投保人數（勞保局，依投保單位所在地）。
 * 地區別代碼用同一資料集的官方「代號對照表」（23＝金門、24＝連江、25＝新竹市、26＝嘉義市）；
 * 對不上就整支失敗 —— 寧可沒有數字，也不要寫進錯的縣市。
 */
import { COUNTIES, normCounty, perMille } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';
import { latestResource } from '../lib/datagov.mjs';

export const id = 'labor';
export const name = '勞保投保人數（勞保局）';
export const provides = ['labor_insured', 'labor_insured_per1000'];
export const dependsOn = ['population'];

/**
 * 勞保 JSON（一列一個投保單位類別×地區）→ 最新月份的縣市投保人數。
 * 地區代碼要靠官方的「代號對照表」換成縣市名；換不到就是整支失敗（寧可沒數字，也不要寫錯縣市）。
 */
export function parseLaborRows(rows, laborCodeToCounty) {
  const split = (ym) => `${String(ym).slice(0, 3)}${String(ym).slice(3)}`;
  const ym = rows.reduce((m, r) => (String(r['資料年月'] ?? '') > m ? String(r['資料年月']) : m), '');
  const out = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
  for (const r of rows) {
    const county = laborCodeToCounty[r['地區別']];
    if (split(r['資料年月'] ?? '') === ym && county) out[county] += Number(r['本月底投保人數']);
  }
  if (Object.values(out).some((n) => n === 0)) throw new Error('勞保地區別代碼對不上，有縣市是 0');
  return { ym, out };
}

export async function collect({ items, fields, download, shared }) {
  const { total, allTotal, sumAll } = shared.population;
  // 勞保投保人數（勞保局，依投保單位所在地）；地區別代碼用同一資料集的官方「代號對照表」（23＝金門、24＝連江、25＝新竹市、26＝嘉義市）
  const laborCodes = await latestResource(100999, (d) => d.resourceFormat === 'JSON' && d.resourceDescription === '代號對照表');
  const LABOR = Object.fromEntries((await (await fetchRetry(laborCodes.resourceDownloadUrl)).json()).filter((r) => r['統計項目'] === '地區別').map((r) => [r['代號'], normCounty(r['對照中文名稱'])]));
  const laborRes = await latestResource(100999, (d) => d.resourceFormat === 'JSON' && /^\d+年統計資料/.test(d.resourceDescription));
  const laborRows = await (await fetchRetry(laborRes.resourceDownloadUrl)).json();
  const { ym: laborYm, out: labor } = parseLaborRows(laborRows, LABOR);
  const laborMeta = { category: '產業', period: `${Number(laborYm.slice(0, 3)) + 1911}-${laborYm.slice(3)} 月底`, source: '勞動部勞工保險局投保單位、人數原始統計', url: 'https://data.gov.tw/dataset/100999' };
  fields.push(
    { key: 'labor_insured', label: '勞保投保人數（依投保單位所在地）', unit: '人', ...laborMeta },
    { key: 'labor_insured_per1000', label: '每千人勞保投保人數', unit: '人／千人', digits: 1, ...laborMeta, national: perMille(sumAll((c) => labor[c]), allTotal) },
  );
  for (const c of COUNTIES) { items[c].labor_insured = labor[c]; items[c].labor_insured_per1000 = perMille(labor[c], total(c)); }}
