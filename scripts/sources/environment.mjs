/**
 * 環境保護與永續（國發會都市及區域發展統計彙編 6-2，源自環境部、國土管理署）。
 * 涵蓋垃圾清運與回收率 (6-2-3)、污水處理率 (6-2-5)、空氣品質與 PM2.5 (6-2-2)。
 */
import { COUNTIES, normCounty, round } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';
import { parseNdcCsv } from './fiscal.mjs';

export const id = 'environment';
export const name = '環境保護與永續（國發會都市彙編）';
export const provides = [
  'waste_per_capita_daily',
  'recycling_rate',
  'waste_total',
  'sewage_treatment_rate',
  'sewage_public_rate',
  'air_pm25',
  'air_aqi',
];
export const dependsOn = ['population'];

const NDC_WASTE_CSV =
  'https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82Mzk2LzkxZmU1YWFkLTYzOGYtNDVlMS05MzgzLTZhY2NmZjM4YjBmOC5jc3Y%3d&n=Ni0yLTMg5Z6D5Zy%2b5riF6YGL6JmV55CG54uA5rOBLmNzdg%3d%3d&icon=.csv&state=preview';
const NDC_SEWAGE_CSV =
  'https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82Mzk2L2M5ODBmMTBhLTU5YzMtNGI5ZS05OWVlLTMxYTI5YWMzMjMyNC5jc3Y%3d&n=Ni0yLTUg5rGh5rC06JmV55CG546HLmNzdg%3d%3d&icon=.csv&state=preview';
const NDC_AIR_CSV =
  'https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82Mzk2Lzk1OTRmMTdhLWE0NjItNDQ5NS05N2MzLTI4OGNkNWJhMDMzNS5jc3Y%3d&n=Ni0yLTIg56m65rCj5rGh5p%2bT5ris5a6a57WQ5p6cLmNzdg%3d%3d&icon=.csv&state=preview';

export async function collect({ items, fields, shared }) {
  const { total, allTotal, sumAll } = shared.population;
  const wText = await (await fetchRetry(NDC_WASTE_CSV, { label: '國發會垃圾清運' })).text();
  const sText = await (await fetchRetry(NDC_SEWAGE_CSV, { label: '國發會污水處理' })).text();
  const aText = await (await fetchRetry(NDC_AIR_CSV, { label: '國發會空氣品質' })).text();

  const wRows = parseNdcCsv(wText);
  const sRows = parseNdcCsv(sText);
  const aRows = parseNdcCsv(aText);

  const wYear = wRows[0]?.['年'] ?? '2024';
  const sYear = sRows[0]?.['年'] ?? '2024';
  const aYear = aRows[0]?.['年'] ?? '2024';

  const byCWaste = Object.fromEntries(wRows.map((r) => [normCounty(r['地區']), r]));
  const byCSewage = Object.fromEntries(sRows.map((r) => [normCounty(r['地區']), r]));
  const byCAir = Object.fromEntries(aRows.map((r) => [normCounty(r['地區']), r]));

  const natWaste = byCWaste['臺閩地區'] ?? byCWaste['臺灣地區'];
  const natSewage = byCSewage['臺閩地區'] ?? byCSewage['臺灣地區'];

  const wasteMeta = {
    category: '環境',
    period: `${wYear} 年`,
    source: '國發會都市及區域發展統計彙編（環境部統計處資料）',
    url: 'https://data.gov.tw/dataset/6511',
  };
  const sewageMeta = {
    category: '環境',
    period: `${sYear} 年底`,
    source: '國發會都市及區域發展統計彙編（內政部國土管理署資料）',
    url: 'https://data.gov.tw/dataset/6513',
  };
  const airMeta = {
    category: '環境',
    period: `${aYear} 年`,
    source: '國發會都市及區域發展統計彙編（環境部空氣品質監測資料）',
    url: 'https://data.gov.tw/dataset/6510',
  };

  const natWasteTotal = natWaste ? Math.round(Number(natWaste['垃圾產生量總計']) / 10000) : null;
  const natWasteDaily = natWaste ? round(Number(natWaste['平均每人每日垃圾產生量(公斤)']), 3) : null;
  const natRecycleRate = natWaste ? round(Number(natWaste['垃圾回收率']), 2) : null;
  const natSewagePublic = natSewage ? round(Number(natSewage['公共污水下水道普及率']), 2) : null;
  const natSewageTotal = natSewage ? round(Number(natSewage['污水處理率合計']), 2) : null;

  // 全國 AQI、PM2.5 人口加權平均
  const natAqi = round(sumAll((c) => (byCAir[c] ? Number(byCAir[c][`空氣品質指標${aYear}`]) * total(c) : 0)) / allTotal, 0);
  const natPm25 = round(sumAll((c) => (byCAir[c] ? Number(byCAir[c][`細懸浮微粒${aYear}`]) * total(c) : 0)) / allTotal, 1);

  fields.push(
    { key: 'waste_per_capita_daily', label: '每人每日垃圾產生量', unit: '公斤／人-日', digits: 3, ...wasteMeta, national: natWasteDaily },
    { key: 'recycling_rate', label: '垃圾回收率', unit: '%', digits: 2, ...wasteMeta, national: natRecycleRate },
    { key: 'waste_total', label: '垃圾產生總量', unit: '萬公噸', ...wasteMeta, national: natWasteTotal },
    { key: 'sewage_treatment_rate', label: '污水處理率合計', unit: '%', digits: 2, ...sewageMeta, national: natSewageTotal },
    { key: 'sewage_public_rate', label: '公共污水下水道普及率', unit: '%', digits: 2, ...sewageMeta, national: natSewagePublic },
    { key: 'air_pm25', label: '細懸浮微粒年均濃度', unit: '微克／立方公尺', digits: 1, ...airMeta, national: natPm25 },
    { key: 'air_aqi', label: '空氣品質指標年均值', unit: '', digits: 0, ...airMeta, national: natAqi },
  );

  for (const c of COUNTIES) {
    const wr = byCWaste[c];
    if (wr) {
      items[c].waste_total = wr['垃圾產生量總計'] ? Math.round(Number(wr['垃圾產生量總計']) / 10000) : null;
      items[c].waste_per_capita_daily = wr['平均每人每日垃圾產生量(公斤)'] ? round(Number(wr['平均每人每日垃圾產生量(公斤)']), 3) : null;
      items[c].recycling_rate = wr['垃圾回收率'] ? round(Number(wr['垃圾回收率']), 2) : null;
    }
    const sr = byCSewage[c];
    if (sr) {
      items[c].sewage_public_rate = sr['公共污水下水道普及率'] ? round(Number(sr['公共污水下水道普及率']), 2) : null;
      items[c].sewage_treatment_rate = sr['污水處理率合計'] ? round(Number(sr['污水處理率合計']), 2) : null;
    }
    const ar = byCAir[c];
    if (ar) {
      items[c].air_aqi = ar[`空氣品質指標${aYear}`] ? Math.round(Number(ar[`空氣品質指標${aYear}`])) : null;
      items[c].air_pm25 = ar[`細懸浮微粒${aYear}`] ? round(Number(ar[`細懸浮微粒${aYear}`]), 1) : null;
    }
  }
}
