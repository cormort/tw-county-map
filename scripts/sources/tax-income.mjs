/**
 * 綜合所得稅申報核定統計（財政部財政資訊中心 表 6-1）。
 * 涵蓋 22 縣市（含金門、連江）。
 */
import { COUNTIES, round } from '../lib/county.mjs';
import { pdfLines } from '../lib/download.mjs';

export const id = 'tax-income';
export const name = '所得稅申報與稅額（財政部財資中心）';
export const provides = [
  'tax_filing_units',
  'tax_filing_avg_income',
  'tax_filing_total_income',
  'tax_filing_tax_payable',
  'tax_filing_avg_tax',
  'tax_filing_effective_rate',
];
export const dependsOn = [];

const FIA_PDF = 'https://www.fia.gov.tw/WEB/fia/ias/isa112/112_6-1.pdf';
const FIA_YEAR = '112 年度';

export function parseTaxLines(lines) {
  const data = {};
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const parts = trimmed.split(/\s+/);
    let county = '';
    let rest = [];
    if (parts[0].length === 1 && parts[1]?.length === 1 && parts[2]?.length === 1) {
      county = parts[0] + parts[1] + parts[2];
      rest = parts.slice(3);
    } else if (parts[0].length === 3) {
      county = parts[0];
      rest = parts.slice(1);
    }
    if (county && COUNTIES.includes(county) && rest.length >= 8) {
      data[county] = {
        units: Number(rest[0]), // 戶
        total_income: Math.round(Number(rest[1]) / 1000), // 千元轉百萬元
        avg_income: Math.round((Number(rest[1]) * 1000) / Number(rest[0])), // 元
        tax_payable: Math.round(Number(rest[4]) / 1000), // 百萬元
        avg_tax: Math.round((Number(rest[4]) * 1000) / Number(rest[0])), // 元
        effective_rate: Number(rest[9]), // %
      };
    }
  }
  return data;
}

export async function collect({ items, fields, download }) {
  const pdf = await download(FIA_PDF, 'fia_112_6_1.pdf');
  const text = pdfLines(pdf);
  const data = parseTaxLines(text);

  const totalUnits = Object.values(data).reduce((s, d) => s + d.units, 0);
  const sumTotalIncome = Object.values(data).reduce((s, d) => s + d.total_income, 0);
  const sumTaxPayable = Object.values(data).reduce((s, d) => s + d.tax_payable, 0);

  const econMeta = {
    category: '經濟',
    period: FIA_YEAR,
    source: '財政部財政資訊中心綜合所得稅初步核定統計專冊（表 6-1）',
    url: FIA_PDF,
  };
  const fiscalMeta = {
    category: '財政',
    period: FIA_YEAR,
    source: '財政部財政資訊中心綜合所得稅初步核定統計專冊（表 6-1）',
    url: FIA_PDF,
  };

  fields.push(
    { key: 'tax_filing_avg_income', label: '申報戶平均綜合所得', unit: '元', ...econMeta, national: Math.round((sumTotalIncome * 1e6) / totalUnits) },
    { key: 'tax_filing_total_income', label: '綜合所得申報總額', unit: '百萬元', ...econMeta, national: sumTotalIncome },
    { key: 'tax_filing_units', label: '綜稅申報戶數', unit: '戶', ...econMeta, national: totalUnits },
    { key: 'tax_filing_tax_payable', label: '綜稅應納稅額', unit: '百萬元', ...fiscalMeta, national: sumTaxPayable },
    { key: 'tax_filing_avg_tax', label: '申報戶平均應納稅額', unit: '元', ...fiscalMeta, national: Math.round((sumTaxPayable * 1e6) / totalUnits) },
    { key: 'tax_filing_effective_rate', label: '綜稅有效稅率', unit: '%', digits: 2, ...fiscalMeta, national: round((sumTaxPayable / sumTotalIncome) * 100, 2) },
  );

  for (const c of COUNTIES) {
    const d = data[c];
    if (!d) continue;
    items[c].tax_filing_units = d.units;
    items[c].tax_filing_total_income = d.total_income;
    items[c].tax_filing_avg_income = d.avg_income;
    items[c].tax_filing_tax_payable = d.tax_payable;
    items[c].tax_filing_avg_tax = d.avg_tax;
    items[c].tax_filing_effective_rate = d.effective_rate;
  }
}
