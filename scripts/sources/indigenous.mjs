/**
 * 原住民人口（戶政司現住原住民人口按性別、年齡）。
 * 村里×性別×身分×年齡約 470 萬列，用串流加總（不要整包讀進記憶體）。
 * 只算平地＋山地原住民；「平埔原住民」是新增的身分別（全國約一千多人），不併入。
 */
import { spawn } from 'node:child_process';
import { createInterface } from 'node:readline';

import { COUNTIES, share } from '../lib/county.mjs';
import { latestResource } from '../lib/datagov.mjs';

export const id = 'indigenous';
export const name = '原住民人口（戶政司）';
export const provides = ['indigenous', 'indigenous_ratio'];
export const dependsOn = ['population'];

/**
 * 原住民人口檔的一列 → { county, count }（不是原住民列或認不出縣市就回 null）。
 *
 * 只算平地＋山地原住民（一般說的原住民人口）；「平埔原住民」是新增的身分別，
 * 全國約一千多人，不併入 —— 併進去會讓每一族的數字都對不上官方統計。
 */
export function indigenousLineOf(line) {
  const r = line.split(',');
  const county = r[2]?.slice(0, 3);
  if (!COUNTIES.includes(county)) return null;
  if (r[5] !== '平地原住民' && r[5] !== '山地原住民') return null;
  return { county, count: Number(r[7]) || 0 };
}

export async function collect({ items, fields, download, shared }) {
  const { total, allTotal, share, sumAll } = shared.population;
  // 原住民人口（戶政司現住原住民人口按性別、年齡；村里×性別×身分×年齡約 470 萬列，用串流加總）
  const indRes = await latestResource(77129, (d) => /^\d{5}/.test(d.resourceDescription) && d.resourceFormat === 'ZIP');
  const indZip = await download(indRes.resourceDownloadUrl, 'indigenous.zip');
  const indigenous = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
  const indProc = spawn('unzip', ['-p', indZip]);
  for await (const line of createInterface({ input: indProc.stdout })) {
    const hit = indigenousLineOf(line);
    if (hit) indigenous[hit.county] += hit.count;
  }
  const indYm = indRes.resourceDescription.slice(0, 5);
  const indMeta = { category: '人口', period: `${Number(indYm.slice(0, 3)) + 1911}-${indYm.slice(3)}`, source: '內政部戶政司現住原住民人口', url: 'https://data.gov.tw/dataset/77129' };
  fields.push(
    { key: 'indigenous', label: '原住民人口（平地＋山地）', unit: '人', ...indMeta },
    { key: 'indigenous_ratio', label: '原住民人口比率', unit: '%', ...indMeta, national: share(sumAll((c) => indigenous[c]), allTotal) },
  );
  for (const c of COUNTIES) { items[c].indigenous = indigenous[c]; items[c].indigenous_ratio = share(indigenous[c], total(c)); }}
