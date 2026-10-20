#!/usr/bin/env node
/**
 * 產生 public/data/county-stats.json：醫療、房價、農地等分縣市統計。
 * 前端照 fields 自動長出指標，之後要加別的統計只要在這裡多推幾個 field。
 *
 * 用法：node scripts/county-stats.mjs   （需要 pdftotext、unzip；macOS：brew install poppler）
 *
 * 來源：
 * - 衛福部「醫事機構服務量統計年報」PDF 表 20／24／28（年報一年一本，新一年要換 MOHW_PDF 與 MOHW_YEAR）
 * - 內政部實價登錄開放資料，最近四季的不動產買賣（SEASONS 要跟著季別往後推）
 * - 農業部「農耕土地面積」開放資料（data.gov.tw/dataset/94988），取最新年度
 */
import { execFileSync } from 'node:child_process';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'county-stats.json');
const MOHW_PDF = 'https://www.mohw.gov.tw/dl-97890-29ae7106-ef97-442e-b3ff-9a8eb164f7a6.html';
const MOHW_YEAR = '113 年底';
const SEASONS = ['114S4', '115S1', '115S2', '115S3'];
const FARM = 'https://data.moa.gov.tw/Service/OpenData/TransService.aspx?UnitId=TtusYV8k5Wz8&IsTransData=1';

const COUNTIES = ['基隆市', '臺北市', '新北市', '桃園市', '新竹市', '新竹縣', '苗栗縣', '臺中市', '彰化縣', '南投縣', '雲林縣',
  '嘉義市', '嘉義縣', '臺南市', '高雄市', '屏東縣', '宜蘭縣', '花蓮縣', '臺東縣', '澎湖縣', '金門縣', '連江縣'];
/** 實價登錄檔名的縣市代碼 */
const LVR = { a: '臺北市', b: '臺中市', c: '基隆市', d: '臺南市', e: '高雄市', f: '新北市', g: '宜蘭縣', h: '桃園市', i: '嘉義市',
  j: '新竹縣', k: '苗栗縣', m: '南投縣', n: '彰化縣', o: '新竹市', p: '雲林縣', q: '嘉義縣', t: '屏東縣', u: '花蓮縣', v: '臺東縣',
  w: '金門縣', x: '澎湖縣', z: '連江縣' };
/** 農業部資料的地區代碼 */
const MOA = { 65000: '新北市', 63000: '臺北市', 68000: '桃園市', 66000: '臺中市', 67000: '臺南市', 64000: '高雄市', 10002: '宜蘭縣',
  10004: '新竹縣', 10005: '苗栗縣', 10007: '彰化縣', 10008: '南投縣', 10009: '雲林縣', 10010: '嘉義縣', 10013: '屏東縣', 10014: '臺東縣',
  10015: '花蓮縣', 10016: '澎湖縣', 10017: '基隆市', 10018: '新竹市', 10020: '嘉義市', '09020': '金門縣', '09007': '連江縣' };

const tmp = await mkdtemp(join(tmpdir(), 'county-stats-'));
const items = Object.fromEntries(COUNTIES.map((c) => [c, {}]));
const fields = [];
const round = (n, d = 1) => Math.round(n * 10 ** d) / 10 ** d;
const per10k = (part, pop) => round((part / pop) * 10000, 2);

async function download(url, name) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
  const path = join(tmp, name);
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
  return path;
}

/* ---------- 醫療（衛福部年報） ---------- */

const pdf = await download(MOHW_PDF, 'mohw.pdf');
const text = execFileSync('pdftotext', ['-layout', pdf, '-'], { maxBuffer: 1 << 28 }).toString().split('\n');

/** 表格本體（跳過目錄那一行）：回傳 縣市 → 數字欄位（「-」當 0） */
function table(title) {
  const start = text.findIndex((l) => l.replace(/\s/g, '').startsWith(title) && !l.includes('....'));
  if (start < 0) throw new Error(`年報找不到「${title}」`);
  const rows = {};
  for (const line of text.slice(start)) {
    const m = line.match(/^\s*((?:\S\s*){2}[縣市])\s+[A-Za-z][A-Za-z ]*?\s{2,}(.*)$/);
    if (!m) continue;
    const county = m[1].replace(/\s/g, '');
    if (!COUNTIES.includes(county) || rows[county]) continue;
    rows[county] = m[2].trim().split(/\s+/).map((t) => (t === '-' ? 0 : Number(t.replace(/,/g, ''))));
    if (Object.keys(rows).length === COUNTIES.length) return rows;
  }
  throw new Error(`「${title}」只讀到 ${Object.keys(rows).length} 個縣市`);
}

const inst = table('表20醫療院所家數');
const beds = table('表24醫療院所病床數');
const staff = table('表28醫療院所執業醫事人員數'); // [年底人口, 醫事人員合計, 西醫師, 中醫師, 牙醫師, …]
const mohw = { period: MOHW_YEAR, source: '衛福部醫事機構服務量統計年報', url: MOHW_PDF };
const medical = [
  ['institutions', '醫療院所數', '家', (c) => inst[c][0]],
  ['hospitals', '醫院數', '家', (c) => inst[c][1]],
  ['clinics', '診所數', '家', (c) => inst[c][0] - inst[c][1]],
  ['beds', '病床數', '床', (c) => beds[c][0]],
  ['physicians', '西醫師數', '人', (c) => staff[c][2]],
  ['doctors_all', '醫師數（西醫＋中醫＋牙醫）', '人', (c) => staff[c][2] + staff[c][3] + staff[c][4]],
];
const pop = (c) => staff[c][0];
const totalPop = COUNTIES.reduce((s, c) => s + pop(c), 0);
for (const [key, label, unit, value] of medical) {
  fields.push({ key, label, unit, ...mohw });
  for (const c of COUNTIES) items[c][key] = value(c);
}
// 每萬人比率用年報自己的年底人口（跟網站其他指標的人口月份不同，分子分母同一時點才對）
for (const [key, label, unit, value] of medical.filter(([k]) => k !== 'hospitals' && k !== 'clinics')) {
  const total = COUNTIES.reduce((s, c) => s + value(c), 0);
  fields.push({ key: `${key}_per10k`, label: `每萬人${label.replace(/數/, '')}`, unit: `${unit}／萬人`, digits: 1, ...mohw, national: per10k(total, totalPop) });
  for (const c of COUNTIES) items[c][`${key}_per10k`] = per10k(value(c), pop(c));
}

/* ---------- 房價、成交量（實價登錄） ---------- */

const PING = 3.305785; // 1 坪 = 3.305785 m²
const prices = Object.fromEntries(COUNTIES.map((c) => [c, []]));
const deals = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
for (const season of SEASONS) {
  const zip = await download(`https://plvr.land.moi.gov.tw/DownloadSeason?season=${season}&type=zip&fileName=lvr_landcsv.zip`, `${season}.zip`);
  for (const [code, county] of Object.entries(LVR)) {
    let csv;
    try {
      csv = execFileSync('unzip', ['-p', zip, `${code}_lvr_land_a.csv`], { maxBuffer: 1 << 28 }).toString();
    } catch {
      continue; // 該季該縣市沒有檔案
    }
    const [header, , ...rows] = csv.replace(/^﻿/, '').split(/\r?\n/).filter(Boolean); // 第二列是英文欄名
    const col = Object.fromEntries(header.split(',').map((h, i) => [h, i]));
    for (const row of rows) {
      const r = row.split(','); // ponytail: 實價登錄 CSV 沒有引號欄位，直接切逗號；哪天出現引號再換 parser
      if (!r[col['交易標的']]?.includes('建物')) continue; // 只算有房子的買賣（排除純土地、純車位）
      deals[county] += 1;
      const unitPrice = Number(r[col['單價元平方公尺']]);
      // 房價只看住宅、排除親友或特殊關係等異常交易
      if (r[col['主要用途']] !== '住家用' || !(unitPrice > 0) || /親友|特殊|員工|瑕疵|急買急賣|毛胚/.test(r[col['備註']])) continue;
      prices[county].push((unitPrice * PING) / 10000);
    }
  }
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const lvr = { period: `近四季申報：${SEASONS.map((x) => `${x.slice(0, 3)} 年 Q${x.at(-1)}`).filter((_, i, a) => !i || i === a.length - 1).join('–')}`, source: '內政部實價登錄', url: 'https://plvr.land.moi.gov.tw/DownloadOpenData' };
fields.push(
  { key: 'house_price', label: '住宅成交單價中位數', unit: '萬元／坪', digits: 1, ...lvr, national: round(median(Object.values(prices).flat())) },
  { key: 'house_deals', label: '房屋買賣件數', unit: '件', ...lvr },
  { key: 'house_deals_per10k', label: '每萬人房屋買賣件數', unit: '件／萬人', digits: 1, ...lvr, national: per10k(Object.values(deals).reduce((s, n) => s + n, 0), totalPop) },
);
for (const c of COUNTIES) {
  const m = median(prices[c]);
  items[c].house_price = m === null ? null : round(m);
  items[c].house_deals = deals[c];
  items[c].house_deals_per10k = per10k(deals[c], pop(c));
}

/* ---------- 農地（農業部） ---------- */

const farm = await (await fetch(FARM)).json();
const year = Math.max(...farm.map((r) => Number(r.year)));
// cultivated_area 其實是「耕地佔土地面積 %」，公頃數要把五類加總（台中 112 年 ≈ 47,520 公頃，與市府年報相符）
const PARTS = ['rice', 'short_norice', 'short_leisure', 'long_farm', 'long_leisure'];
const moa = { period: `${year} 年`, source: '農業部農耕土地面積', url: 'https://data.gov.tw/dataset/94988' };
fields.push(
  { key: 'farmland', label: '耕地面積', unit: '公頃', ...moa },
  { key: 'farmland_ratio', label: '耕地佔土地面積比率', unit: '%', ...moa },
);
for (const r of farm.filter((r) => Number(r.year) === year)) {
  const county = MOA[r.county_code];
  if (!county) continue; // 「台灣省」小計
  const ha = Math.round(PARTS.reduce((s, k) => s + Number(r[k]), 0));
  // 連江縣各欄全是 0：比較像沒填報，當作無資料，不要在排行榜墊底
  items[county].farmland = ha || null;
  items[county].farmland_ratio = ha ? Number(r.cultivated_area) : null;
}

await writeFile(OUT, JSON.stringify({ meta: { generated_at: new Date().toISOString() }, fields, items }));
console.log(`寫出 ${OUT}：${fields.length} 個指標`);
for (const c of ['臺北市', '臺中市', '連江縣']) console.log(c, JSON.stringify(items[c]));
