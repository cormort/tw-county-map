#!/usr/bin/env node
/**
 * 從立委觀測站的 API 產生靜態快照（public/data/*.json）。
 *
 * 用法：
 *   node scripts/snapshot.mjs                     # 預設打 http://127.0.0.1:8787
 *   API=http://127.0.0.1:8787 node scripts/snapshot.mjs
 *
 * 只抓「縣市地圖」這一頁真的會用到的端點：
 * - council：六都各一份（縣市明細的「議員選舉與席次」）
 * - split-ticket：依年份各存一份（那一頁可以切年份；沒有年份的那一份是預設值）
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const API = (process.env.API ?? 'http://127.0.0.1:8787').replace(/\/$/, '');
const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data');

/** 與 src/api/client.ts 的 slugFor() 必須一致 */
function slugFor(url) {
  const parsed = new URL(url, 'http://localhost/');
  const base = parsed.pathname.replace(/^\/api\/v1\//, '').replace(/\/$/, '');
  const extra = [...parsed.searchParams.entries()]
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}-${value}`);
  // 保留中文：`/api/v1/council?county=臺北市` → `council-county-臺北市`（快照檔名就是這個）
  return [base, ...extra].join('-').replace(/[\/:*?"<>|\s]/g, '');
}

const PATHS = [
  '/counties',
  '/council?only=counties',
  '/legislator-votes',
  '/demographics',
  '/population-trend',
  '/town-map',
  '/split-ticket',
];

async function get(path) {
  const response = await fetch(`${API}/api/v1${path}`);
  if (!response.ok) throw new Error(`${path} → HTTP ${response.status}`);
  return response.json();
}

await mkdir(OUT, { recursive: true });
const written = [];

for (const path of PATHS) {
  const body = await get(path);
  const name = `${slugFor(`/api/v1${path}`)}.json`;
  await writeFile(join(OUT, name), JSON.stringify(body));
  written.push([name, JSON.stringify(body).length]);
}

// 議員席次：只有六都有資料，每個縣市各一份（/council?county=臺北市）
const councilList = JSON.parse(await (await fetch(`${API}/api/v1/council`)).text());
for (const county of councilList.counties ?? []) {
  const path = `/council?county=${encodeURIComponent(county)}`;
  const body = await get(path);
  const name = `${slugFor(`/api/v1/council?county=${county}`)}.json`;
  await writeFile(join(OUT, name), JSON.stringify(body));
  written.push([name, JSON.stringify(body).length]);
}

// split-ticket 每一種年份各一份
const split = JSON.parse(await (await fetch(`${API}/api/v1/split-ticket`)).text());
for (const year of split.years ?? []) {
  const path = `/split-ticket?year=${year}`;
  const body = await get(path);
  const name = `${slugFor(`/api/v1${path}`)}.json`;
  await writeFile(join(OUT, name), JSON.stringify(body));
  written.push([name, JSON.stringify(body).length]);
}

const generatedAt = new Date().toISOString();
await writeFile(join(OUT, '_snapshot.json'), JSON.stringify({ generated_at: generatedAt, api: API, files: written.length }, null, 2));

for (const [name, bytes] of written) console.log(`${(bytes / 1024).toFixed(0).padStart(6)} KB  ${name}`);
console.log(`\n${written.length} 份快照 → public/data（${generatedAt}）`);
