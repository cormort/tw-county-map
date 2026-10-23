/**
 * 生產中工廠家數（經濟部產業發展署登記工廠名錄）。
 * 索引 CSV 指向每月更新的 zip，zip 裡只有一個當月檔名（例如 11509.csv）。
 */
import { execFileSync } from 'node:child_process';

import { COUNTIES, csvLine, normCounty, per10k } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';

export const id = 'factories';
export const name = '工廠（產發署登記工廠名錄）';
export const provides = ['factories', 'factories_per10k'];
export const dependsOn = ['population'];

/** 登記工廠名錄 CSV 的列 → 各縣市工廠家數（縣市取「工廠市鎮鄉村里」前 3 字） */
export function parseFactoryRows(lines) {
  const header = csvLine(lines[0].replace(/^\uFEFF/, ''));
  const col = header.indexOf('工廠市鎮鄉村里');
  if (col < 0) throw new Error('工廠名錄沒有「工廠市鎮鄉村里」欄，格式變了');
  const counts = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
  for (const l of lines.slice(1)) {
    const c = normCounty(csvLine(l)[col] ?? '').slice(0, 3);
    if (c in counts) counts[c] += 1;
  }
  return counts;
}

export async function collect({ items, fields, download, shared }) {
  const { total, allTotal, sumAll } = shared.population;
  // 生產中工廠（產業發展署登記工廠名錄；索引 CSV 指向每月更新的 zip）
  const factoryIndex = (await (await fetchRetry('https://www.ida.gov.tw/opendata/02/SDD6569.csv')).text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map(csvLine);
  const factoryZip = await download(factoryIndex.at(-1).at(-1), 'factory.zip');
  const factoryEntry = execFileSync('unzip', ['-Z1', factoryZip]).toString().trim().split('\n')[0]; // 例如 11509.csv
  const factoryLines = execFileSync('unzip', ['-p', factoryZip, factoryEntry], { maxBuffer: 1 << 28 }).toString().split(/\r?\n/);
  const factories = parseFactoryRows(factoryLines);
  const factoryPeriod = `${Number(factoryEntry.slice(0, 3)) + 1911}-${factoryEntry.slice(3, 5)}`;
  const idaMeta = { category: '產業', period: factoryPeriod, source: '經濟部產業發展署登記工廠名錄（生產中）', url: 'https://data.gov.tw/dataset/6569' };
  fields.push(
    { key: 'factories', label: '生產中工廠家數', unit: '家', ...idaMeta },
    { key: 'factories_per10k', label: '每萬人工廠家數', unit: '家／萬人', digits: 1, ...idaMeta, national: per10k(sumAll((c) => factories[c]), allTotal) },
  );
  for (const c of COUNTIES) { items[c].factories = factories[c]; items[c].factories_per10k = per10k(factories[c], total(c)); }}
