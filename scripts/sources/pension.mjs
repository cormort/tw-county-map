/**
 * 國民年金被保險人數（國民年金監理會每月 PDF「按身分別及地區分」，地區依戶籍）。
 *
 * PDF 文字裡有 CJK 相容字（「北」是 U+F963、「蘭」是 U+F91F…），看起來一樣但比對不上，先 NFKC 正規化。
 * 這份 PDF 是三層來源裡最容易壞的（政府改版就找不到連結），壞了只影響這兩個指標。
 */
import { COUNTIES, share } from '../lib/county.mjs';
import { pdfLines } from '../lib/download.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';

export const id = 'pension';
export const name = '國民年金（監理會 PDF）';
export const provides = ['national_pension', 'national_pension_ratio'];
export const dependsOn = ['population'];

/**
 * 國民年金 PDF 的文字行 → 縣市 → 被保險人數。
 * PDF 文字裡有 CJK 相容字（「北」是 U+F963、「蘭」是 U+F91F…），看起來一樣但比對不上，先 NFKC 正規化。
 */
export function parseNpRows(lines) {
  const rows = {};
  for (const line of lines) {
    const m = line.match(/^\s*((?:\S\s*){2}[縣市])\s+([\d,]+)/);
    const c = m?.[1].replace(/\s/g, '').normalize('NFKC');
    if (c && COUNTIES.includes(c) && !(c in rows)) rows[c] = Number(m[2].replace(/,/g, ''));
  }
  return rows;
}

export async function collect({ items, fields, download, shared }) {
  const { ageSum, share, sumAll } = shared.population;
  // 國民年金被保險人數（勞保局，國民年金監理會每月 PDF「按身分別及地區分」，地區依戶籍）
  const npList = await (await fetchRetry('https://dep.mohw.gov.tw/NPSC/lp-5387-118-1-20.html')).text();
  const npLink = npList.match(/(dl-\d+-[0-9a-f-]+\.html)" title="(\d+)年(\d+)月-pdf/);
  if (!npLink) throw new Error('國民年金監理會的列表頁格式變了，找不到最新月份的 PDF');
  const npPdf = await download(`https://dep.mohw.gov.tw/NPSC/${npLink[1]}`, 'national-pension.pdf');
  const npRows = parseNpRows(pdfLines(npPdf));
  if (Object.keys(npRows).length !== COUNTIES.length) throw new Error(`國民年金 PDF 只讀到 ${Object.keys(npRows).length} 個縣市`);
  const npMeta = { category: '經濟', period: `${Number(npLink[2]) + 1911}-${npLink[3].padStart(2, '0')}`, source: '勞動部勞工保險局（國民年金監理會「國民年金被保險人數－按身分別及地區分」）', url: 'https://dep.mohw.gov.tw/NPSC/lp-5387-118-1-20.html' };
  const age25to64 = (c) => ageSum(c, 25, 64);
  fields.push(
    { key: 'national_pension', label: '國民年金被保險人數', unit: '人', ...npMeta },
    { key: 'national_pension_ratio', label: '國保被保險人占 25–64 歲人口比率', unit: '%', ...npMeta, national: share(sumAll((c) => npRows[c]), sumAll(age25to64)) },
  );
  for (const c of COUNTIES) { items[c].national_pension = npRows[c]; items[c].national_pension_ratio = share(npRows[c], age25to64(c)); }}
