/**
 * 地方稅實徵淨額（財政部統計處「財政統計月報」表 3-5：直轄市及縣(市)稅實徵淨額總計－按地區別分）。
 *
 * 這是「真正的」地方稅（地價稅、房屋稅、土地增值稅、使用牌照稅、契稅、印花稅、娛樂稅…），
 * 不含中央統籌分配稅款 —— 跟國發會歲入決算的「稅課收入」是不同口徑，兩者不要混用。
 *
 * 月報表 3-5 的「本年度累計實徵淨額」在 12 月那一期就是全年數；12 月號約隔年 1 月發布
 * （例如 114 年 12 月號是 11501）。所以用「去年」的年報，抓不到就往前退一年。
 * 表上註明是初步統計數，正式核定數要等審計單位決算。
 */
import { COUNTIES } from '../lib/county.mjs';
import { pdfLines } from '../lib/download.mjs';
import { yearEndPopulation } from '../lib/population-history.mjs';

export const id = 'local-tax';
export const name = '地方稅（財政部統計月報）';
export const provides = ['local_tax', 'local_tax_per_capita'];
export const dependsOn = ['population'];

/**
 * 表 3-5 的列 → 各縣市全年地方稅（百萬元）。
 *
 * 列長這樣：`    臺   北    市   15,606,029   908,482   6.2   77,655,227   -2,385,753  -3.0 …`
 * 數字依序是：本月實徵淨額、較上年同月增減數／率、本年度累計實徵淨額、較上年同期增減數／率…
 * 第 4 個數字（index 3）才是全年累計；單位千元，換成百萬元。
 */
export function parseLocalTaxLines(lines) {
  const out = {};
  for (const line of lines) {
    const m = line.match(/^\s*((?:\S\s*){2}[縣市])\s+(.*)$/);
    if (!m) continue;
    const county = m[1].replace(/\s/g, '');
    if (!COUNTIES.includes(county)) continue;
    const nums = [...m[2].matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((x) => Number(x[0].replace(/,/g, '')));
    if (nums.length < 4 || !Number.isFinite(nums[3])) continue;
    out[county] = Math.round(nums[3] / 1000); // 千元 → 百萬元
  }
  return out;
}

/** 表頭的資料年月（例如「114年12月」）；不是 12 月號就回 null，往上退一年重抓 */
export function decemberOf(lines) {
  const m = lines.join('\n').match(/(\d{2,3})年12月/);
  return m ? Number(m[1]) : null;
}

/** 表 3-5 的「合   計」列（全國）→ 全年地方稅（百萬元） */
export function parseLocalTaxTotal(lines) {
  for (const line of lines) {
    const m = line.match(/^\s*合\s+計\s+(.*)$/);
    if (!m) continue;
    const nums = [...m[1].matchAll(/-?\d[\d,]*(?:\.\d+)?/g)].map((x) => Number(x[0].replace(/,/g, '')));
    if (nums.length >= 4 && Number.isFinite(nums[3])) return Math.round(nums[3] / 1000);
  }
  return null;
}

export async function collect({ items, fields, shared, download }) {
  const { total, sumAll } = shared.population;
  const rocNow = new Date().getUTCFullYear() - 1911;
  let dataRoc = null;
  let localTax = null;
  let nationalTotal = null;
  let url = '';
  // 12 月號的檔名是「隔年 1 月」的出版序號；1 月初可能還沒上架，往前退一年
  for (const pubRoc of [rocNow, rocNow - 1, rocNow - 2]) {
    const candidate = `https://service.mof.gov.tw/public/Data/statistic/index/${pubRoc}01/83050.pdf`;
    try {
      const pdf = await download(candidate, `local-tax-${pubRoc}01.pdf`);
      const lines = pdfLines(pdf);
      const year = decemberOf(lines);
      const data = parseLocalTaxLines(lines);
      if (!year || Object.keys(data).length < COUNTIES.length) continue;
      dataRoc = year;
      localTax = data;
      nationalTotal = parseLocalTaxTotal(lines);
      url = candidate;
      break;
    } catch (error) {
      console.warn(`[local-tax] ${candidate} 抓不到（${error?.message ?? error}），換前一年`);
    }
  }
  if (!dataRoc || !localTax) throw new Error('找不到地方稅 12 月號（表 3-5）');

  const adYear = dataRoc + 1911;
  const pop = await yearEndPopulation(adYear); // 2025 年度稅收 → 2025-12 人口
  const popSum = sumAll((c) => pop[c]);
  const meta = {
    category: '財政',
    period: `${adYear} 年度`,
    source: '財政部統計處財政統計月報（表 3-5 直轄市及縣(市)稅實徵淨額，初步統計數）',
    url,
  };

  const national = nationalTotal ?? Math.round(sumAll((c) => localTax[c] ?? 0));
  fields.push(
    { key: 'local_tax', label: '地方稅實徵淨額', unit: '百萬元', ...meta, national },
    { key: 'local_tax_per_capita', label: '平均每人地方稅負', unit: '元', ...meta, national: Math.round((national * 1e6) / popSum) },
  );
  for (const c of COUNTIES) {
    items[c].local_tax = localTax[c] ?? null;
    items[c].local_tax_per_capita = localTax[c] == null ? null : Math.round((localTax[c] * 1e6) / (pop[c] ?? total(c)));
  }
}
