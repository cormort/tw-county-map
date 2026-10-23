#!/usr/bin/env node
/**
 * runner：把 scripts/sources/ 裡每個來源模組跑一遍，合併成 public/data/county-stats.json。
 * 介面與共用工具見 scripts/sources/README.md；來源壞掉只會影響它自己的欄位。
 */
import { mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COUNTIES } from './lib/county.mjs';
import { detectAnomaly, valuesOf } from './lib/anomaly.mjs';
import { pruneCache, staleSources } from './lib/fetch-cache.mjs';
import { makeDownloader } from './lib/download.mjs';
import { sources } from './sources/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'county-stats.json');
const TRENDS_OUT = join(ROOT, 'public', 'data', 'county-trends.json');

const previous = await readFile(OUT, 'utf8').then(JSON.parse).catch(() => null); // 上一版（沿用舊值與固定欄位順序用）
const tmp = await mkdtemp(join(tmpdir(), 'county-stats-'));
const items = Object.fromEntries(COUNTIES.map((c) => [c, {}]));
const fields = [];
const trends = {};
const shared = {}; // 來源之間共用已算好的中間結果（例如年報人口、住宅成交總價）
const ctx = { tmp, items, fields, trends, shared, download: makeDownloader(tmp) };

/** 依 dependsOn 排出順序（被依賴的先跑；成環就報錯，不要靜靜地只跑一半） */
function orderOf(list) {
  const done = new Set();
  const out = [];
  const walk = (source, stack = []) => {
    if (done.has(source.id)) return;
    if (stack.includes(source.id)) throw new Error(`來源相依成環：${[...stack, source.id].join(' → ')}`);
    for (const dep of source.dependsOn ?? []) {
      const target = list.find((s) => s.id === dep);
      if (!target) throw new Error(`${source.id} 宣告相依 ${dep}，但沒有這個模組`);
      walk(target, [...stack, source.id]);
    }
    done.add(source.id);
    out.push(source);
  };
  for (const source of list) walk(source);
  return out;
}

const statuses = [];
for (const source of orderOf(sources)) {
  const t0 = Date.now();
  try {
    if (process.env.COUNTY_STATS_FAIL_SOURCE === source.id) throw new Error('（驗證用）模擬來源失敗');
    const result = (await source.collect(ctx)) ?? {};
    if (result.trends) Object.assign(trends, result.trends);
    if (result.shared) shared[source.id] = result.shared;
    statuses.push({ id: source.id, name: source.name, status: 'ok' });
    console.log(`[source] ${source.name} ok（${Date.now() - t0} ms）`);
  } catch (error) {
    const message = String(error?.message ?? error);
    console.error(`[source] ${source.name} 失敗：${message}`);
    statuses.push({ id: source.id, name: source.name, status: 'failed', error: message });
  }
}
if (!fields.length) throw new Error('沒有任何來源成功，保留舊檔不寫入');

// 數值異常偵測：格式改版／改單位最常見的症狀是「整欄跳一個數量級」。
// 判定異常就沿用上一版，不要讓可疑數字上線（並在 meta.anomalies 說明原因）。
const anomalies = [];
for (const field of fields) {
  const prevValues = valuesOf(previous?.items, field.key);
  if (!Object.keys(prevValues).length) continue;
  const result = detectAnomaly(prevValues, valuesOf(items, field.key));
  if (!result.anomaly) continue;
  for (const [county, value] of Object.entries(prevValues)) {
    if (value !== undefined) items[county][field.key] = value;
  }
  field.anomaly = { detected_at: new Date().toISOString(), median_change: Number((result.medianChange ?? 0).toFixed(3)), compared: result.compared };
  anomalies.push({ key: field.key, label: field.label, median_change: field.anomaly.median_change, compared: result.compared, counties: result.counties });
}

// 失敗的來源不要讓指標憑空消失 —— 沿用上一版 JSON 的那幾欄，並在欄位上標 carried_at。
const ownerOf = new Map();
for (const source of sources) for (const key of source.provides ?? []) ownerOf.set(key, source.id);
const carried = [];
const have = new Set(fields.map((f) => f.key));
for (const field of previous?.fields ?? []) {
  if (have.has(field.key)) continue;
  const values = Object.fromEntries(COUNTIES.map((c) => [c, previous.items?.[c]?.[field.key]]).filter(([, v]) => v !== undefined));
  if (!Object.keys(values).length) continue; // 上一版本來就沒有這欄（新指標或從來沒成功過）
  fields.push({ ...field, carried_at: previous.meta?.generated_at ?? null });
  for (const [c, v] of Object.entries(values)) items[c][field.key] = v;
  carried.push({ key: field.key, owner: ownerOf.get(field.key) ?? null, carried_at: previous.meta?.generated_at ?? null });
}

// 欄位順序照上一版排（新指標排最後），這樣某個來源臨時失敗時畫面不會整個跳位
const orderOfKey = new Map((previous?.fields ?? []).map((f, i) => [f.key, i]));
fields.sort((a, b) => (orderOfKey.get(a.key) ?? Number.MAX_SAFE_INTEGER) - (orderOfKey.get(b.key) ?? Number.MAX_SAFE_INTEGER));

const stale = [...staleSources.values()].sort((a, b) => a.host.localeCompare(b.host));
const meta = {
  generated_at: new Date().toISOString(),
  sources: statuses,
  ...(stale.length ? { stale_sources: stale } : {}),
  ...(carried.length ? { carried } : {}),
  ...(anomalies.length ? { anomalies } : {}),
};
await writeFile(TRENDS_OUT, JSON.stringify({ meta: { generated_at: meta.generated_at }, series: trends }));
await writeFile(OUT, JSON.stringify({ meta, fields, items }));
console.log(`寫出 ${OUT}：${fields.length} 個指標（來源 ${statuses.length} 個）`);
if (stale.length) console.log(`[stale] ${stale.length} 個來源改用快取：${stale.map((s) => `${s.host}（${s.cached_at.slice(0, 10)}）`).join('、')}`);
else console.log('[stale] 無：所有來源都是這次抓到的');
if (anomalies.length) console.log(`[anomaly] ${anomalies.length} 個指標數值變動異常，已沿用上一版：${anomalies.map((a) => `${a.key}（中位數變動 ${(a.median_change * 100).toFixed(0)}%）`).join('、')}`);
if (carried.length) console.log(`[carried] ${carried.length} 個指標沿用上一版：${carried.map((x) => x.key).join('、')}`);
else console.log('[carried] 無：所有指標都是這次算出來的');
for (const c of ['臺北市', '連江縣']) console.log(c, JSON.stringify(items[c]));

// 快取有上限：不清會一直長（key 含年月季別，每期都新增）
const pruned = await pruneCache();
if (pruned.skipped) console.log('[cache] 沒有快取目錄，略過清理');
else console.log(`[cache] 移除 ${pruned.removed} 個舊快取，保留 ${pruned.kept} 個（${Math.round(pruned.bytes / 1024 / 1024)} MB）`);
