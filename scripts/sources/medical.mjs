/**
 * 醫療（衛福部「醫事機構服務量統計年報」PDF 表 20／24／28）。
 * 年報一年一本：新年度要換 MOHW_PDF 與 MOHW_YEAR。
 *
 * 順便提供年報自己的年底人口（`shared.pop`／`shared.totalPop`）給房價、所得的每萬人比率用
 * —— 分子分母同一時點才對，不要拿戶政司的當月人口去算年報的比率。
 */
import { COUNTIES, per10k } from '../lib/county.mjs';
import { pdfLines } from '../lib/download.mjs';

export const id = 'medical';
export const name = '醫療（衛福部年報）';
export const provides = ['institutions', 'hospitals', 'clinics', 'beds', 'physicians', 'doctors_all',
  'institutions_per10k', 'beds_per10k', 'physicians_per10k', 'doctors_all_per10k'];
export const dependsOn = [];

const MOHW_PDF = 'https://www.mohw.gov.tw/dl-97890-29ae7106-ef97-442e-b3ff-9a8eb164f7a6.html';
const MOHW_YEAR = '113 年底';

/**
 * 表格本體（跳過目錄那一行）：回傳 縣市 → 數字欄位（「-」當 0）。
 * 抽成純函式是為了能測：餵幾行假年報文字就能驗證解析規則，不必下載 2 MB 的 PDF。
 */
export function tableFromLines(lines, title, expect = COUNTIES.length) {
  const start = lines.findIndex((l) => l.replace(/\s/g, '').startsWith(title) && !l.includes('....'));
  if (start < 0) throw new Error(`年報找不到「${title}」`);
  const rows = {};
  for (const line of lines.slice(start)) {
    const m = line.match(/^\s*((?:\S\s*){2}[縣市])\s+[A-Za-z][A-Za-z ]*?\s{2,}(.*)$/);
    if (!m) continue;
    const county = m[1].replace(/\s/g, '').normalize('NFKC');
    if (!COUNTIES.includes(county) || rows[county]) continue;
    rows[county] = m[2].trim().split(/\s+/).map((t) => (t === '-' ? 0 : Number(t.replace(/,/g, ''))));
    if (Object.keys(rows).length === expect) return rows;
  }
  throw new Error(`「${title}」只讀到 ${Object.keys(rows).length} 個縣市`);
}

export async function collect({ items, fields, download }) {
  const pdf = await download(MOHW_PDF, 'mohw.pdf');
  const text = pdfLines(pdf);

  const inst = tableFromLines(text, '表20醫療院所家數');
  const beds = tableFromLines(text, '表24醫療院所病床數');
  const staff = tableFromLines(text, '表28醫療院所執業醫事人員數'); // [年底人口, 醫事人員合計, 西醫師, 中醫師, 牙醫師, …]
  const mohw = { category: '醫療', period: MOHW_YEAR, source: '衛福部醫事機構服務量統計年報', url: MOHW_PDF };
  const medical = [
    ['institutions', '醫療院所數', '家', (c) => inst[c][0]],
    ['hospitals', '醫院數', '家', (c) => inst[c][1]],
    ['clinics', '診所數', '家', (c) => inst[c][0] - inst[c][1]],
    ['beds', '病床數', '床', (c) => beds[c][0]],
    ['physicians', '西醫師數', '人', (c) => staff[c][2]],
    ['doctors_all', '醫師數（西醫＋中醫＋牙醫）', '人', (c) => staff[c][2] + staff[c][3] + staff[c][4]],
  ];
  const pop = (c) => staff[c][0];
  const totalPop = COUNTIES.reduce((s, c) => s + pop(c), 0);
  for (const [key, label, unit, value] of medical) {
    fields.push({ key, label, unit, ...mohw });
    for (const c of COUNTIES) items[c][key] = value(c);
  }
  // 每萬人比率用年報自己的年底人口（跟網站其他指標的人口月份不同，分子分母同一時點才對）
  for (const [key, label, unit, value] of medical.filter(([k]) => k !== 'hospitals' && k !== 'clinics')) {
    const total = COUNTIES.reduce((s, c) => s + value(c), 0);
    fields.push({ key: `${key}_per10k`, label: `每萬人${label.replace(/數/, '')}`, unit: `${unit}／萬人`, digits: 1, ...mohw, national: per10k(total, totalPop) });
    for (const c of COUNTIES) items[c][`${key}_per10k`] = per10k(value(c), pop(c));
  }
  return { shared: { pop, totalPop } };
}
