#!/usr/bin/env node
/**
 * runner：把 scripts/sources/ 裡每個來源模組跑一遍，合併成 public/data/county-stats.json。
 * 介面與共用工具見 scripts/sources/README.md；來源壞掉只會影響它自己的欄位。
 */
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { COUNTIES } from './lib/county.mjs';
import { staleSources } from './lib/fetch-cache.mjs';
import { makeDownloader } from './lib/download.mjs';
import { sources } from './sources/index.mjs';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const OUT = join(ROOT, 'public', 'data', 'county-stats.json');
const TRENDS_OUT = join(ROOT, 'public', 'data', 'county-trends.json');

const tmp = await mkdtemp(join(tmpdir(), 'county-stats-'));
const items = Object.fromEntries(COUNTIES.map((c) => [c, {}]));
const fields = [];
const trends = {};
const ctx = { tmp, items, fields, trends, download: makeDownloader(tmp) };

/** 依 dependsOn 排出順序（被依賴的先跑；成環就報錯，不要靜靜地只跑一半） */
function orderOf(list) {
  const done = new Set();
  const out = [];
  const walk = (source, stack = []) => {
    if (done.has(source.name)) return;
    if (stack.includes(source.name)) throw new Error(`來源相依成環：${[...stack, source.name].join(' → ')}`);
    for (const dep of source.dependsOn ?? []) {
      const target = list.find((s) => s.name === dep);
      if (!target) throw new Error(`${source.name} 宣告相依 ${dep}，但沒有這個模組`);
      walk(target, [...stack, source.name]);
    }
    done.add(source.name);
    out.push(source);
  };
  for (const source of list) walk(source);
  return out;
}

const statuses = [];
for (const source of orderOf(sources)) {
  const t0 = Date.now();
  try {
    const result = (await source.collect(ctx)) ?? {};
    if (result.trends) Object.assign(trends, result.trends);
    statuses.push({ name: source.name, status: 'ok' });
    console.log(`[source] ${source.name} ok（${Date.now() - t0} ms）`);
  } catch (error) {
    const message = String(error?.message ?? error);
    console.error(`[source] ${source.name} 失敗：${message}`);
    statuses.push({ name: source.name, status: 'failed', error: message });
  }
}
if (!fields.length) throw new Error('沒有任何來源成功，保留舊檔不寫入');

const stale = [...staleSources.values()].sort((a, b) => a.host.localeCompare(b.host));
const meta = {
  generated_at: new Date().toISOString(),
  sources: statuses,
  ...(stale.length ? { stale_sources: stale } : {}),
};
await writeFile(TRENDS_OUT, JSON.stringify({ meta: { generated_at: meta.generated_at }, series: trends }));
await writeFile(OUT, JSON.stringify({ meta, fields, items }));
console.log(`寫出 ${OUT}：${fields.length} 個指標（來源 ${statuses.length} 個）`);
if (stale.length) console.log(`[stale] ${stale.length} 個來源改用快取：${stale.map((s) => `${s.host}（${s.cached_at.slice(0, 10)}）`).join('、')}`);
else console.log('[stale] 無：所有來源都是這次抓到的');
for (const c of ['臺北市', '連江縣']) console.log(c, JSON.stringify(items[c]));
