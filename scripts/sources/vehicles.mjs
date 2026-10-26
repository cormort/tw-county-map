/**
 * 車輛數與交通費用（國發會都市及區域發展統計彙編 6-3-2，源自交通部統計處），
 * 以及公共充電樁與充電站設施（交通部運輸資料流通服務 TDX）。
 *
 * TDX 的 ConnectCounts（槍數）常有站點沒填報，逐站用 ConnectorCount 加總補，
 * 並保證槍數不低於樁數；樁數（ChargingCounts）才是比率指標的分子。
 */
import { COUNTIES, round } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';
import { parseNdcCsv } from './fiscal.mjs';

export const id = 'vehicles';
export const name = '車輛數、交通費用與公共充電樁（國發會彙編＋交通部 TDX）';
export const provides = [
  'cars',
  'passenger_cars',
  'motorcycles',
  'cars_per1000',
  'passenger_cars_per1000',
  'motorcycles_per1000',
  'transport_cost_per_household',
  'ev_charging_points',
  'ev_charging_stations',
  'ev_charging_plugs',
  'ev_charging_per10k_cars',
  'ev_charging_per100k_pop',
];
export const dependsOn = ['population'];

const NDC_VEHICLES_CSV =
  'https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82Mzk2LzlhM2U1ZmI2LTRhNWMtNGRhOC05NGUzLTgxNjcwMWUwYTQ0OS5jc3Y%3d&n=Ni0zLTIg5Lqk6YCa6LK755So44CB5rG96LuK5pW45Y%2bK5qmf6LuK5pW4LmNzdg%3d%3d&icon=.csv';

const TDX_EV_COUNTS_URL = 'https://tdx.transportdata.tw/webapi/EVChargingData/Counts';

const ENTITY_TO_COUNTY = {
  TPE: '臺北市',
  TRTC: '臺北市',
  NWT: '新北市',
  NTMC: '新北市',
  TAO: '桃園市',
  TAC: '桃園市',
  TYMC: '桃園市',
  TXG: '臺中市',
  TMRT: '臺中市',
  TNN: '臺南市',
  KHH: '高雄市',
  KRTC: '高雄市',
  KCG: '高雄市',
  KEE: '基隆市',
  HSZ: '新竹市',
  HSQ: '新竹縣',
  MIA: '苗栗縣',
  CHA: '彰化縣',
  NAN: '南投縣',
  YUN: '雲林縣',
  CYQ: '嘉義縣',
  CYI: '嘉義市',
  PIF: '屏東縣',
  ILA: '宜蘭縣',
  HUA: '花蓮縣',
  TTT: '臺東縣',
  KIN: '金門縣',
  PEN: '澎湖縣',
  LIE: '連江縣',
};

/**
 * TDX 的「縣市×營運商」統計 → 各縣市站數、樁數、槍數。
 *
 * TDX 的 Item.ConnectCounts 常整批缺漏（臺中市多數站填 0，直接加總只剩 254 槍，比 1,421 樁還少），
 * 所以槍數逐站算：站內 ConnectorCount 加總（沒填 ConnectorCount 就用 ConnectorDetailList 筆數），
 * 再跟站上報的 ConnectCounts、樁數取最大值 —— 至少 1 樁 1 槍，缺報不會讓槍數低於樁數。
 */
export function sumEvCounts(entries) {
  const out = Object.fromEntries(COUNTIES.map((c) => [c, { stations: 0, points: 0, plugs: 0 }]));
  for (const entry of entries ?? []) {
    const county = ENTITY_TO_COUNTY[entry.EntityCode];
    if (!county || !out[county]) continue;
    const item = entry.Item || {};
    if (!Array.isArray(item.StationDetailList)) {
      const points = item.ChargingCounts || 0;
      out[county].stations += item.StationCounts || 0;
      out[county].points += points;
      out[county].plugs += Math.max(item.ConnectCounts || 0, points);
      continue;
    }
    for (const station of item.StationDetailList) {
      const pointList = station.ChargingPointDetailList ?? [];
      const points = station.ChargingPointCount ?? pointList.length;
      const connectors = pointList.reduce((n, p) => n + (p.ConnectorCount || p.ConnectorDetailList?.length || 0), 0);
      out[county].stations += 1;
      out[county].points += points;
      out[county].plugs += Math.max(station.ConnectCounts || 0, connectors, points);
    }
  }
  return out;
}

export async function collect({ items, fields, shared }) {
  const { total, allTotal, sumAll } = shared.population;
  const text = await (await fetchRetry(NDC_VEHICLES_CSV, { label: '國發會車輛數' })).text();
  const rows = parseNdcCsv(text);
  const year = rows[0]?.['年'] ?? '2024';
  const byCounty = Object.fromEntries(rows.map((r) => [r['地區'], r]));

  const nationalRow = byCounty['臺閩地區'] ?? byCounty['臺灣地區'];
  const nationalCars = nationalRow ? Number(nationalRow['汽車數合計']) : sumAll((c) => Number(byCounty[c]?.['汽車數合計'] || 0));
  const nationalMotorcycles = nationalRow ? Number(nationalRow['機車數']) : sumAll((c) => Number(byCounty[c]?.['機車數'] || 0));
  const nationalPassenger = nationalRow ? Number(nationalRow['小客車數']) : sumAll((c) => Number(byCounty[c]?.['小客車數'] || 0));

  const meta = {
    category: '交通',
    period: `${year} 年底`,
    source: '國發會都市及區域發展統計彙編（交通部統計處監理資料）',
    url: 'https://data.gov.tw/dataset/6500',
  };

  // 抓取 TDX 公共充電樁統計
  let evCounts = [];
  try {
    const evRes = await fetchRetry(TDX_EV_COUNTS_URL, { label: '交通部 TDX 充電樁', timeoutMs: 60_000 });
    evCounts = await evRes.json();
  } catch (err) {
    console.warn('[vehicles] 抓取 TDX 充電樁失敗：', err?.message || err);
  }

  const evByCounty = sumEvCounts(evCounts);

  const nationalPoints = sumAll((c) => evByCounty[c].points);
  const nationalStations = sumAll((c) => evByCounty[c].stations);
  const nationalPlugs = sumAll((c) => evByCounty[c].plugs);
  const nationalPer10kCars = nationalCars > 0 ? round((nationalPoints / nationalCars) * 10000, 1) : null;
  const nationalPer100kPop = round((nationalPoints / allTotal) * 100000, 1);

  const evMeta = {
    category: '交通',
    period: '2026 年最新',
    source: '交通部運輸資料流通服務（TDX）公共充電樁資料',
    url: 'https://tdx.transportdata.tw/ev-charging/evChargingData',
  };

  fields.push(
    { key: 'cars', label: '汽車登記數', unit: '輛', ...meta, national: nationalCars },
    { key: 'passenger_cars', label: '小客車登記數', unit: '輛', ...meta, national: nationalPassenger },
    { key: 'motorcycles', label: '機車登記數', unit: '輛', ...meta, national: nationalMotorcycles },
    {
      key: 'cars_per1000',
      label: '每千人汽車數',
      unit: '輛／千人',
      digits: 1,
      ...meta,
      national: nationalRow ? round(Number(nationalRow['汽車持有率總計']), 1) : round((nationalCars / allTotal) * 1000, 1),
    },
    {
      key: 'passenger_cars_per1000',
      label: '每千人小客車數',
      unit: '輛／千人',
      digits: 1,
      ...meta,
      national: nationalRow ? round(Number(nationalRow['小客車持有率']), 1) : round((nationalPassenger / allTotal) * 1000, 1),
    },
    {
      key: 'motorcycles_per1000',
      label: '每千人機車數',
      unit: '輛／千人',
      digits: 1,
      ...meta,
      national: nationalRow ? round(Number(nationalRow['機車持有率']), 1) : round((nationalMotorcycles / allTotal) * 1000, 1),
    },
    {
      key: 'transport_cost_per_household',
      label: '平均每戶全年交通費用',
      unit: '元',
      ...meta,
      national: nationalRow ? Math.round(Number(nationalRow['平均每戶全年交通費用'])) : null,
    },
    { key: 'ev_charging_points', label: '公共充電樁數', unit: '支', ...evMeta, national: nationalPoints },
    { key: 'ev_charging_stations', label: '公共充電站數', unit: '處', ...evMeta, national: nationalStations },
    { key: 'ev_charging_plugs', label: '公共充電槍數', unit: '槍', ...evMeta, national: nationalPlugs },
    { key: 'ev_charging_per10k_cars', label: '每萬輛汽車充電樁數', unit: '支／萬輛汽車', digits: 1, ...evMeta, national: nationalPer10kCars },
    { key: 'ev_charging_per100k_pop', label: '每十萬人充電樁數', unit: '支／十萬人', digits: 1, ...evMeta, national: nationalPer100kPop },
  );

  for (const c of COUNTIES) {
    const row = byCounty[c];
    if (row) {
      items[c].cars = row['汽車數合計'] ? Number(row['汽車數合計']) : null;
      items[c].passenger_cars = row['小客車數'] ? Number(row['小客車數']) : null;
      items[c].motorcycles = row['機車數'] ? Number(row['機車數']) : null;
      items[c].cars_per1000 = row['汽車持有率總計'] ? round(Number(row['汽車持有率總計']), 1) : null;
      items[c].passenger_cars_per1000 = row['小客車持有率'] ? round(Number(row['小客車持有率']), 1) : null;
      items[c].motorcycles_per1000 = row['機車持有率'] ? round(Number(row['機車持有率']), 1) : null;
      items[c].transport_cost_per_household = row['平均每戶全年交通費用'] ? Math.round(Number(row['平均每戶全年交通費用'])) : null;
    }
    const ev = evByCounty[c];
    items[c].ev_charging_points = ev.points;
    items[c].ev_charging_stations = ev.stations;
    items[c].ev_charging_plugs = ev.plugs;
    items[c].ev_charging_per10k_cars = items[c].cars ? round((ev.points / items[c].cars) * 10000, 1) : null;
    items[c].ev_charging_per100k_pop = round((ev.points / total(c)) * 100000, 1);
  }
}
