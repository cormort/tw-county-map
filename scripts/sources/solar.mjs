/**
 * 太陽光電與再生能源（台電各縣市再生能源別購入情形，包含太陽光電、風力等容量與發電量）。
 */
import { COUNTIES, normCounty, round } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';

export const id = 'solar';
export const name = '太陽光電與再生能源（台電購入情形）';
export const provides = [
  'solar_capacity',
  'solar_power',
  'solar_count',
  'solar_capacity_per_capita',
  'renewable_capacity',
  'renewable_power',
  'solar_share',
];
export const dependsOn = ['population'];

const TAIPOWER_RENEWABLE_CSV = 'https://service.taipower.com.tw/data/opendata/apply/file/d007011/001.csv';

export async function collect({ items, fields, shared }) {
  const { total, allTotal, sumAll } = shared.population;
  const trends = {};
  const res = await fetchRetry(TAIPOWER_RENEWABLE_CSV, { label: '台電再生能源購入' });
  const text = await res.text();
  const rows = text.trim().split(/\r?\n/).slice(1).map((r) => r.split(','));

  // 取得最新年度（例如 114 年）
  const allYears = [...new Set(rows.map((r) => r[0]))].filter((y) => /^\d+$/.test(y)).sort((a, b) => Number(a) - Number(b));
  const latestYear = allYears.at(-1) ?? '114';
  const latestAdYear = String(Number(latestYear) + 1911);

  const solarData = Object.fromEntries(COUNTIES.map((c) => [c, {
    solarCount: 0,
    solarKw: 0,
    solarKwh: 0,
    totalCount: 0,
    totalKw: 0,
    totalKwh: 0,
  }]));

  for (const r of rows) {
    if (r[0] !== latestYear) continue;
    const c = normCounty(r[1]);
    if (!solarData[c]) continue;
    solarData[c] = {
      solarCount: Number(r[5]) || 0,
      solarKw: Number(r[6]) || 0,
      solarKwh: Number(r[7]) || 0,
      totalCount: Number(r[11]) || 0,
      totalKw: Number(r[12]) || 0,
      totalKwh: Number(r[13]) || 0,
    };
  }

  const nationalSolarKw = sumAll((c) => solarData[c].solarKw);
  const nationalSolarKwh = sumAll((c) => solarData[c].solarKwh);
  const nationalSolarCount = sumAll((c) => solarData[c].solarCount);
  const nationalTotalKw = sumAll((c) => solarData[c].totalKw);
  const nationalTotalKwh = sumAll((c) => solarData[c].totalKwh);

  const meta = {
    category: '能源',
    period: `${latestAdYear} 年（民國 ${latestYear} 年）`,
    source: '台灣電力公司各縣市再生能源別購入情形',
    url: 'https://data.gov.tw/dataset/29936',
  };

  fields.push(
    { key: 'solar_capacity', label: '太陽光電躉購裝置容量', unit: '千瓩', ...meta, national: Math.round(nationalSolarKw / 1000) },
    { key: 'solar_power', label: '太陽光電累計購電量', unit: '百萬度', ...meta, national: Math.round(nationalSolarKwh / 1e6) },
    { key: 'solar_count', label: '太陽光電案場件數', unit: '件', ...meta, national: nationalSolarCount },
    { key: 'solar_capacity_per_capita', label: '每人太陽光電裝置容量', unit: '瓦／人', digits: 1, ...meta, national: round((nationalSolarKw * 1000) / allTotal, 1) },
    { key: 'renewable_capacity', label: '再生能源總裝置容量', unit: '千瓩', ...meta, national: Math.round(nationalTotalKw / 1000) },
    { key: 'renewable_power', label: '再生能源總購電量', unit: '百萬度', ...meta, national: Math.round(nationalTotalKwh / 1e6) },
    { key: 'solar_share', label: '太陽光電占再生能源容量比重', unit: '%', digits: 1, ...meta, national: nationalTotalKw > 0 ? round((nationalSolarKw / nationalTotalKw) * 100, 1) : 0 },
  );

  for (const c of COUNTIES) {
    const d = solarData[c];
    items[c].solar_capacity = Math.round(d.solarKw / 1000);
    items[c].solar_power = Math.round(d.solarKwh / 1e6);
    items[c].solar_count = d.solarCount;
    items[c].solar_capacity_per_capita = round((d.solarKw * 1000) / total(c), 1);
    items[c].renewable_capacity = Math.round(d.totalKw / 1000);
    items[c].renewable_power = Math.round(d.totalKwh / 1e6);
    items[c].solar_share = d.totalKw > 0 ? round((d.solarKw / d.totalKw) * 100, 1) : 0;
  }

  // 歷年趨勢
  const trendYears = allYears.filter((y) => Number(y) >= 105);
  trends.solar_capacity = {
    label: '太陽光電裝置容量（千瓩）',
    unit: '千瓩',
    points: trendYears.map((y) => {
      const yearRows = rows.filter((r) => r[0] === y);
      const byC = Object.fromEntries(yearRows.map((r) => [normCounty(r[1]), Number(r[6]) || 0]));
      return {
        period: String(Number(y) + 1911),
        values: Object.fromEntries(COUNTIES.map((c) => [c, Math.round((byC[c] || 0) / 1000)])),
      };
    }),
  };

  trends.renewable_capacity = {
    label: '再生能源總裝置容量（千瓩）',
    unit: '千瓩',
    points: trendYears.map((y) => {
      const yearRows = rows.filter((r) => r[0] === y);
      const byC = Object.fromEntries(yearRows.map((r) => [normCounty(r[1]), Number(r[12]) || 0]));
      return {
        period: String(Number(y) + 1911),
        values: Object.fromEntries(COUNTIES.map((c) => [c, Math.round((byC[c] || 0) / 1000)])),
      };
    }),
  };

  return { trends };
}
