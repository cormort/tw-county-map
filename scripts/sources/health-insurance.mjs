/**
 * 全民健保：全國設籍人口參加健保人數（健保署，每年；縣市×鄉鎮×性別×年齡）。
 * 參加率的分母用同月戶籍人口（戶政司村里人口），所以跟人口模組的月份要對得上。
 */
import { COUNTIES, normCounty, share } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';
import { latestResource } from '../lib/datagov.mjs';
import { villageCsv } from '../lib/moi.mjs';

export const id = 'health-insurance';
export const name = '健保參加人數（健保署）';
export const provides = ['nhi_insured', 'nhi_coverage'];
export const dependsOn = ['population'];

/**
 * 健保 CSV（縣市×鄉鎮×性別×年齡）→ 各縣市參加人數。
 * 同一個縣市會有很多列（鄉鎮×性別×年齡），要加總；資料年月取最後一列看到的（同一份檔案都一樣）。
 */
export function parseNhiRows(lines) {
  const nhi = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
  let ym = '';
  for (const l of lines.slice(1)) {
    const r = l.split(',');
    const c = normCounty(r[1] ?? '');
    if (c in nhi) { nhi[c] += Number(r[6]) || 0; ym = r[0]; }
  }
  return { ym, nhi };
}

export async function collect({ items, fields, download, shared }) {
  const { share, sumAll } = shared.population;
  // 全民健保：全國設籍人口參加健保人數（健保署，每年；縣市×鄉鎮×性別×年齡），參加率的分母用同月戶籍人口
  const nhiRes = await latestResource(37276, (d) => d.resourceFormat === 'CSV');
  const nhiLines = (await (await fetchRetry(nhiRes.resourceDownloadUrl)).text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean);
  const { ym: nhiYm, nhi } = parseNhiRows(nhiLines);
  const nhiPopYm = `${Number(nhiYm.slice(0, 3)) + 1911}/${nhiYm.slice(3)}`;
  const nhiPop = await villageCsv('population', nhiPopYm);
  if (!nhiPop) throw new Error(`缺 ${nhiPopYm} 的村里人口資料（健保參加率的分母）`);
  const nhiMeta = { category: '醫療', period: nhiPopYm.replace('/', '-'), source: '衛福部中央健康保險署全國設籍人口參加健保人數', url: 'https://data.gov.tw/dataset/37276' };
  fields.push(
    { key: 'nhi_insured', label: '設籍人口參加健保人數', unit: '人', ...nhiMeta },
    { key: 'nhi_coverage', label: '健保參加率（參加健保人數 ÷ 同月戶籍人口）', unit: '%', ...nhiMeta, national: share(sumAll((c) => nhi[c]), sumAll((c) => nhiPop[c]['人口數'])) },
  );
  for (const c of COUNTIES) { items[c].nhi_insured = nhi[c]; items[c].nhi_coverage = share(nhi[c], nhiPop[c]['人口數']); }}
