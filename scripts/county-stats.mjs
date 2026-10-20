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
 * - 戶政司村里單一年齡人口、出生死亡（kiang/data.moi.gov.tw 轉存），取最新月份與近 12 個月
 * - 移民署外籍與大陸港澳配偶人數（內政部統計查詢網），取最新月份
 * - 衛福部長照 ABC 據點；主計總處所得、失業率；國發會歲入歲出決算；國庫署公共債務
 * 另寫出 public/data/county-trends.json：所得、失業率、債務、出生數、老年人口比率的歷年值（縣市總覽的趨勢線）
 */
import { execFileSync } from 'node:child_process';
import { get as httpsGet } from 'node:https';
import { rootCertificates } from 'node:tls';
import { mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'data', 'county-stats.json');
const TRENDS_OUT = join(dirname(OUT), 'county-trends.json');
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
const mohw = { category: '醫療', period: MOHW_YEAR, source: '衛福部醫事機構服務量統計年報', url: MOHW_PDF };
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
const totals = Object.fromEntries(COUNTIES.map((c) => [c, []])); // 住宅成交總價（元），算房價所得比
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
      totals[county].push(Number(r[col['總價元']]));
    }
  }
}
const median = (xs) => {
  const s = [...xs].sort((a, b) => a - b);
  return s.length ? (s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2) : null;
};
const lvr = { category: '房價', period: `近四季申報：${SEASONS.map((x) => `${x.slice(0, 3)} 年 Q${x.at(-1)}`).filter((_, i, a) => !i || i === a.length - 1).join('–')}`, source: '內政部實價登錄', url: 'https://plvr.land.moi.gov.tw/DownloadOpenData' };
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
const moa = { category: '農業', period: `${year} 年`, source: '農業部農耕土地面積', url: 'https://data.gov.tw/dataset/94988' };
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

/* ---------- 人口結構、出生死亡（戶政司，kiang/data.moi.gov.tw 轉存）、新住民（移民署） ---------- */

const KIANG = 'https://raw.githubusercontent.com/kiang/data.moi.gov.tw/master/raw';
/** 讀 kiang 轉存的村里 CSV，依「區域別」前三字加總到縣市；回傳 縣市 → 欄名 → 合計 */
async function villageCsv(kind, ym) {
  const res = await fetch(`${KIANG}/${kind}/${ym}/data.csv`);
  if (!res.ok) return null;
  const [header, ...rows] = (await res.text()).replace(/^\uFEFF/, '').split(/\r?\n/).filter(Boolean);
  // 2024 年中以前的檔案是英文欄名（birth_total、people_age_000_m…），統一成中文
  const cols = header.split(',').map((h) => {
    const age = h.match(/^people_age_(\d{3}|100up)_([mf])$/);
    if (age) return `${age[1] === '100up' ? '100歲以上' : `${Number(age[1])}歲`}-${age[2] === 'm' ? '男' : '女'}`;
    return { birth_total: '出生數', death_total: '死亡數', people_total: '人口數', people_total_m: '人口數-男', people_total_f: '人口數-女' }[h] ?? h;
  });
  const sums = Object.fromEntries(COUNTIES.map((c) => [c, {}]));
  for (const row of rows) {
    const r = row.split(','); // ponytail: 這兩份 CSV 沒有引號欄位
    const county = sums[r[2]?.slice(0, 3)];
    if (!county) continue; // 第二列英文欄名
    cols.forEach((col, i) => { if (i > 3) county[col] = (county[col] ?? 0) + Number(r[i]); });
  }
  return sums;
}
const monthsBack = (n) => {
  const d = new Date();
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - n);
  return `${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};
// 最新一個月的單一年齡人口（通常落後一個月）
let popYm;
let ages;
for (let n = 0; n < 6 && !ages; n++) ages = await villageCsv('population', (popYm = monthsBack(n)));
if (!ages) throw new Error('找不到最近半年的村里人口資料');
const popPeriod = popYm.replace('/', '-');
const census = { category: '人口', period: popPeriod, source: '內政部戶政司村里單一年齡人口', url: 'https://github.com/kiang/data.moi.gov.tw' };
const ageSum = (c, from, to) => {
  let n = 0;
  for (let a = from; a <= to; a++) n += (ages[c][`${a}歲-男`] ?? 0) + (ages[c][`${a}歲-女`] ?? 0);
  return n;
};
// 學制的就學年齡（實際年齡，不是學籍人數）
const AGE_GROUPS = [
  ['age_preschool', '學齡前人口（0–5 歲）', 0, 5],
  ['age_primary', '國小學齡人口（6–11 歲）', 6, 11],
  ['age_junior', '國中學齡人口（12–14 歲）', 12, 14],
  ['age_senior', '高中學齡人口（15–17 歲）', 15, 17],
  ['age_college', '大學學齡人口（18–21 歲）', 18, 21],
];
const total = (c) => ages[c]['人口數'];
const allTotal = COUNTIES.reduce((s, c) => s + total(c), 0);
const share = (part, whole) => round((part / whole) * 100, 2);
fields.push(
  { key: 'male', label: '男性人口', unit: '人', ...census },
  { key: 'female', label: '女性人口', unit: '人', ...census },
  { key: 'sex_ratio', label: '性比例（每百女子對男子數）', unit: '男／百女', digits: 1, ...census,
    national: round((COUNTIES.reduce((s, c) => s + ages[c]['人口數-男'], 0) / COUNTIES.reduce((s, c) => s + ages[c]['人口數-女'], 0)) * 100) },
);
for (const c of COUNTIES) {
  items[c].male = ages[c]['人口數-男'];
  items[c].female = ages[c]['人口數-女'];
  items[c].sex_ratio = round((ages[c]['人口數-男'] / ages[c]['人口數-女']) * 100);
}
for (const [key, label, from, to] of AGE_GROUPS) {
  fields.push(
    { key, label, unit: '人', ...census },
    { key: `${key}_ratio`, label: `${label.replace('人口', '人口比率')}`, unit: '%', ...census },
  );
  for (const c of COUNTIES) {
    items[c][key] = ageSum(c, from, to);
    items[c][`${key}_ratio`] = share(items[c][key], total(c));
  }
}

// 出生、死亡：最近 12 個月的村里月資料加總（跟人口同一個迄月）
const vital = Object.fromEntries(COUNTIES.map((c) => [c, { births: 0, deaths: 0 }]));
const popBack = (12 * (new Date().getUTCFullYear() - Number(popYm.slice(0, 4))) + new Date().getUTCMonth() + 1 - Number(popYm.slice(5)));
const vitalMonths = [];
for (let n = popBack; n < popBack + 12; n++) {
  const m = await villageCsv('bdmd', monthsBack(n));
  if (!m) throw new Error(`缺 ${monthsBack(n)} 的出生死亡資料`);
  vitalMonths.push(monthsBack(n));
  for (const c of COUNTIES) { vital[c].births += m[c]['出生數']; vital[c].deaths += m[c]['死亡數']; }
}
const bd = { category: '人口', period: `${vitalMonths.at(-1).replace('/', '-')}～${vitalMonths[0].replace('/', '-')}（近 12 個月）`, source: '內政部戶政司村里出生死亡結婚離婚', url: 'https://github.com/kiang/data.moi.gov.tw' };
const sumOf = (k) => COUNTIES.reduce((s, c) => s + vital[c][k], 0);
const perMille = (n, p) => round((n / p) * 1000, 2);
fields.push(
  { key: 'births', label: '出生數', unit: '人', ...bd },
  { key: 'deaths', label: '死亡數', unit: '人', ...bd },
  { key: 'natural_increase', label: '自然增加數（出生－死亡）', unit: '人', ...bd },
  { key: 'birth_rate', label: '粗出生率', unit: '‰', digits: 2, ...bd, national: perMille(sumOf('births'), allTotal) },
  { key: 'death_rate', label: '粗死亡率', unit: '‰', digits: 2, ...bd, national: perMille(sumOf('deaths'), allTotal) },
);
for (const c of COUNTIES) {
  items[c].births = vital[c].births;
  items[c].deaths = vital[c].deaths;
  items[c].natural_increase = vital[c].births - vital[c].deaths;
  // ponytail: 分母用迄月人口，不是年中人口；差距在千分之零點幾以內
  items[c].birth_rate = perMille(vital[c].births, total(c));
  items[c].death_rate = perMille(vital[c].deaths, total(c));
}

// 新住民（外籍配偶＋大陸港澳配偶，累計人數）：內政部統計查詢網，查本月會回最新一個月（通常落後兩個月）
const now = new Date();
const rocYm = `${now.getUTCFullYear() - 1911}${String(now.getUTCMonth() + 1).padStart(2, '0')}`;
const spouseCsv = await (await fetch(`https://statis.moi.gov.tw/micst/webMain.aspx?sys=220&kind=21&type=1&funid=c0930301&cycle=41&outmode=12&utf=1&compmode=0&outkind=3&fldspc=0,12,&codspc0=0,2,3,2,6,1,9,1,12,1,15,17,&codlst1=111&ym=${rocYm}&ymt=${rocYm}`)).text();
let spousePeriod = '';
for (const line of spouseCsv.split(/\r?\n/)) {
  // "115年 (8~8月)/ 新北市/ 性別總計",總計,外籍配偶,越南,…,大陸配偶,港澳配偶
  const m = line.match(/^"(\d+)年 \((\d+)~\d+月\)\/ (\S+)\/ 性別總計",(.*)$/);
  if (!m || !items[m[3]]) continue;
  spousePeriod = `${Number(m[1]) + 1911}-${m[2].padStart(2, '0')}`;
  const v = m[4].split(',').map((x) => (x === '-' ? 0 : Number(x)));
  items[m[3]].new_residents = v[0];
  items[m[3]].foreign_spouses = v[1];
  items[m[3]].mainland_spouses = v[10] + v[11];
}
if (!spousePeriod) throw new Error('新住民資料格式變了，讀不到縣市列');
const nr = { category: '人口', period: `${spousePeriod} 累計`, source: '內政部移民署外籍與大陸港澳配偶人數', url: 'https://data.gov.tw/dataset/13503' };
fields.push(
  { key: 'new_residents', label: '新住民（外籍＋大陸港澳配偶）', unit: '人', ...nr },
  { key: 'foreign_spouses', label: '外籍配偶', unit: '人', ...nr },
  { key: 'mainland_spouses', label: '大陸港澳配偶', unit: '人', ...nr },
  { key: 'new_residents_per1000', label: '每千人新住民', unit: '人／千人', digits: 1, ...nr,
    national: perMille(COUNTIES.reduce((s, c) => s + items[c].new_residents, 0), allTotal) },
);
for (const c of COUNTIES) items[c].new_residents_per1000 = perMille(items[c].new_residents, total(c));

/* ---------- 人口動態：一年前同月人口 → 人口增減、淨遷入（社會增加）、高齡化速度 ---------- */

const [py, pm] = popYm.split('/').map(Number);
const lastYearYm = `${py - 1}/${String(pm).padStart(2, '0')}`;
const agesLastYear = await villageCsv('population', lastYearYm);
if (!agesLastYear) throw new Error(`缺 ${lastYearYm} 的村里人口資料`);
const elderlyOf = (src, c) => { let n = 0; for (let a = 65; a <= 99; a++) n += (src[c][`${a}歲-男`] ?? 0) + (src[c][`${a}歲-女`] ?? 0); return n + (src[c]['100歲以上-男'] ?? 0) + (src[c]['100歲以上-女'] ?? 0); };
const working = (c) => ageSum(c, 15, 64);
const dyn = { category: '人口', period: `${lastYearYm.replace('/', '-')}→${popPeriod}`, source: '內政部戶政司村里單一年齡人口、出生死亡', url: 'https://github.com/kiang/data.moi.gov.tw' };
const sumAll = (f) => COUNTIES.reduce((s, c) => s + f(c), 0);
const growth = (c) => total(c) - agesLastYear[c]['人口數'];
// 社會增加＝總增加－自然增加（出生－死亡）；戶政司的遷入遷出表只有 xls/ods，這裡用恆等式推回淨遷入
const netMigration = (c) => growth(c) - (vital[c].births - vital[c].deaths);
const lastTotal = (c) => agesLastYear[c]['人口數'];
fields.push(
  { key: 'pop_growth', label: '一年人口增減', unit: '人', ...dyn },
  { key: 'pop_growth_rate', label: '一年人口增減率', unit: '%', ...dyn, national: share(sumAll(growth), sumAll(lastTotal)) },
  { key: 'net_migration', label: '淨遷入（社會增加＝總增加－自然增加）', unit: '人', ...dyn },
  { key: 'net_migration_rate', label: '淨遷入率', unit: '‰', digits: 2, ...dyn, national: perMille(sumAll(netMigration), sumAll(lastTotal)) },
  { key: 'aging_speed', label: '高齡化速度（65 歲以上比率一年增加）', unit: '百分點', ...dyn,
    national: round(share(sumAll((c) => elderlyOf(ages, c)), allTotal) - share(sumAll((c) => elderlyOf(agesLastYear, c)), sumAll(lastTotal)), 2) },
  { key: 'old_dependency', label: '扶老比（65 歲以上 ÷ 15–64 歲）', unit: '%', ...census, national: share(sumAll((c) => elderlyOf(ages, c)), sumAll(working)) },
  { key: 'young_dependency', label: '扶幼比（0–14 歲 ÷ 15–64 歲）', unit: '%', ...census, national: share(sumAll((c) => ageSum(c, 0, 14)), sumAll(working)) },
  { key: 'primary_outlook', label: '6 年後國小學齡人口增減（以現在 0–5 歲推估）', unit: '%', ...census,
    national: share(sumAll((c) => ageSum(c, 0, 5)) - sumAll((c) => ageSum(c, 6, 11)), sumAll((c) => ageSum(c, 6, 11))) },
);
for (const c of COUNTIES) {
  items[c].pop_growth = growth(c);
  items[c].pop_growth_rate = share(growth(c), lastTotal(c));
  items[c].net_migration = netMigration(c);
  items[c].net_migration_rate = perMille(netMigration(c), lastTotal(c));
  items[c].aging_speed = round(share(elderlyOf(ages, c), total(c)) - share(elderlyOf(agesLastYear, c), lastTotal(c)), 2);
  items[c].old_dependency = share(elderlyOf(ages, c), working(c));
  items[c].young_dependency = share(ageSum(c, 0, 14), working(c));
  // ponytail: 不扣死亡與遷徙，只是「現在 0–5 歲 vs 現在 6–11 歲」的粗估
  items[c].primary_outlook = share(ageSum(c, 0, 5) - ageSum(c, 6, 11), ageSum(c, 6, 11));
}

/* ---------- 長照（衛福部長照 ABC 據點，每日更新） ---------- */

const ltcCsv = await (await fetch('https://ltcpap.mohw.gov.tw/publish/abc.csv')).text();
const ltc = Object.fromEntries(COUNTIES.map((c) => [c, new Set()]));
for (const line of ltcCsv.split(/\r?\n/).slice(1)) {
  // "機構名稱","機構代碼","機構種類","縣市代碼",…,"O_ABC"：同一機構每個特約服務各一列，用機構代碼去重。
  // ponytail: 不分 A/B/C —— 臺北市在這份檔案裡一個 C 據點都沒有，C 據點顯然沒完整登錄在這裡
  const m = line.match(/^"[^"]*","([^"]*)","[^"]*","(\d+)",/);
  const county = m && MOA[m[2]];
  if (!county) continue;
  ltc[county].add(m[1]);
}
const ltcMeta = { category: '醫療', period: new Date().toISOString().slice(0, 10), source: '衛福部長照 ABC 據點', url: 'https://data.gov.tw/dataset/88270' };
const elderlyAll = sumAll((c) => elderlyOf(ages, c));
fields.push(
  { key: 'ltc_points', label: '長照 ABC 據點數', unit: '處', ...ltcMeta },
  { key: 'ltc_per1000_elderly', label: '每千名 65 歲以上長者的長照據點', unit: '處／千人', digits: 1, ...ltcMeta,
    national: perMille(sumAll((c) => ltc[c].size), elderlyAll) },
);
for (const c of COUNTIES) {
  items[c].ltc_points = ltc[c].size;
  items[c].ltc_per1000_elderly = perMille(ltc[c].size, elderlyOf(ages, c));
}

/* ---------- 所得、失業率（主計總處）；ws.dgbas.gov.tw 的憑證鏈缺中繼憑證，自己補上 ---------- */

const twcaDer = Buffer.from(await (await fetch('http://sslserver.twca.com.tw/cacert/Cyber_SSL_2023.crt')).arrayBuffer());
const twcaPem = `-----BEGIN CERTIFICATE-----\n${twcaDer.toString('base64').match(/.{1,64}/g).join('\n')}\n-----END CERTIFICATE-----\n`;
const fetchDgbas = (url) => new Promise((resolve, reject) => {
  httpsGet(url, { ca: [...rootCertificates, twcaPem] }, (res) => {
    if (res.statusCode !== 200) return reject(new Error(`${url} → HTTP ${res.statusCode}`));
    const chunks = [];
    res.on('data', (d) => chunks.push(d)).on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
  }).on('error', reject);
});
const trends = {}; // key → { label, unit, points: [{ period, values: { 縣市: 值 } }] }

// 平均每戶可支配所得（年，1998 起；金門、連江不在家庭收支調查範圍）
const incomeRows = (await fetchDgbas('https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/232214/006-%E5%B9%B3%E5%9D%87%E6%AF%8F%E6%88%B6%E5%8F%AF%E6%94%AF%E9%85%8D%E6%89%80%E5%BE%97%E6%8C%89%E5%8D%80%E5%9F%9F%E5%88%A5%E5%88%86.csv'))
  .replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split(',').map((x) => x.replace(/"/g, '')));
const incomeHeader = incomeRows[0].map((h) => h.replace(/-元$/, ''));
const incomeByYear = incomeRows.slice(1).map((r) => ({ period: r[0], values: Object.fromEntries(incomeHeader.slice(1).map((h, i) => [h, Number(r[i + 1])]).filter(([h]) => items[h])) }));
const incomeLatest = incomeByYear.at(-1);
const nationalIncome = Number(incomeRows.at(-1)[1]);
trends.income = { label: '平均每戶可支配所得', unit: '元', points: incomeByYear.slice(-10) };
const dgbasIncome = { category: '經濟', period: `${incomeLatest.period} 年`, source: '主計總處家庭收支調查', url: 'https://data.gov.tw/dataset/9415' };
fields.push({ key: 'income', label: '平均每戶可支配所得', unit: '元', ...dgbasIncome, national: nationalIncome });
for (const c of COUNTIES) items[c].income = incomeLatest.values[c] ?? null;

// 房價所得比：住宅成交總價中位數 ÷ 平均每戶可支配所得（官方用中位數所得，這裡只有平均數，數字會偏低一些）
fields.push({ key: 'price_to_income', label: '房價所得比（成交總價中位數 ÷ 平均每戶可支配所得）', unit: '倍', digits: 1, category: '房價', period: `${lvr.period}；所得 ${incomeLatest.period} 年`, source: '內政部實價登錄＋主計總處家庭收支調查', url: 'https://plvr.land.moi.gov.tw/DownloadOpenData',
  national: round(median(Object.values(totals).flat()) / nationalIncome) });
for (const c of COUNTIES) {
  const m = median(totals[c]);
  items[c].price_to_income = m !== null && items[c].income ? round(m / items[c].income) : null;
}

// 失業率（年；只取已過完的完整年度，表裡也有半年列）
const unempXml = await fetchDgbas('https://ws.dgbas.gov.tw/001/Upload/461/relfile/11525/230038/mp0101a10.xml');
const unempByYear = [...unempXml.matchAll(/<縣市別失業率>([\s\S]*?)<\/縣市別失業率>/g)].map(([, body]) => ({
  period: body.match(/<年月別_Year_and_month>([^<]*)</)[1],
  values: Object.fromEntries([...body.matchAll(/<([^_<>]+)_[^>]*_百分比>([^<]*)</g)].filter(([, n]) => items[n]).map(([, n, v]) => [n, Number(v)])),
  national: Number(body.match(/<臺灣地區_Taiwan_Area_百分比>([^<]*)</)?.[1]),
})).filter((r) => /^\d{4}$/.test(r.period) && Number(r.period) < now.getUTCFullYear());
const unempLatest = unempByYear.at(-1);
trends.unemployment = { label: '失業率', unit: '%', points: unempByYear.slice(-10).map(({ period, values }) => ({ period, values })) };
fields.push({ key: 'unemployment', label: '失業率', unit: '%', category: '經濟', period: `${unempLatest.period} 年`, source: '主計總處人力資源調查', url: 'https://data.gov.tw/dataset/6640', national: unempLatest.national });
for (const c of COUNTIES) items[c].unemployment = unempLatest.values[c] ?? null;

/* ---------- 財政：歲入、歲出決算（國發會彙編）、公共債務（國庫署） ---------- */

const ndcCsv = async (url) => {
  const [header, ...rows] = (await (await fetch(url)).text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
  return rows.map((r) => Object.fromEntries(header.map((h, i) => [h, r[i]])));
};
const rev = await ndcCsv('https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82Mzk2LzYxMTFhZDNmLTZkMmUtNGUxMC05OGRlLTQzNGE0YzgxM2U4My5jc3Y%3d&n=OC0xIOatsuWFpS5jc3Y%3d&icon=.csv');
const exp = await ndcCsv('https://ws.ndc.gov.tw/Download.ashx?u=LzAwMS9hZG1pbmlzdHJhdG9yLzEwL3JlbGZpbGUvNTc4MS82Mzk2L2UxZTliZGQ2LTQyNWYtNGYwYS1iN2E3LTY3OGNhYWE0MzRlYy5jc3Y%3d&n=OC0yIOatsuWHui5jc3Y%3d&icon=.csv');
const fiscalYear = rev[0]['年'];
const revOf = (c) => rev.find((r) => r['地區'] === c);
const expOf = (c) => exp.find((r) => r['地區'] === c);
// 自有財源＝歲入－補助及協助收入（單位百萬元）。以歲出當分母時臺北市會超過 100%（2024 歲入 2,228 億、歲出 1,587 億），
// 跟官方「自有財源比率」對不起來，所以用定義明確的「占歲入比率」
const ownRevenue = (c) => Number(revOf(c)['合計實數']) - Number(revOf(c)['補助及協助收入實數']);
const fiscal = { category: '財政', period: `${fiscalYear} 年度決算`, source: '國發會都市及區域發展統計彙編（各縣市歲入、歲出決算）', url: 'https://data.gov.tw/dataset/6518' };
fields.push(
  { key: 'own_revenue_ratio', label: '自有財源占歲入比率', unit: '%', ...fiscal, national: share(sumAll(ownRevenue), sumAll((c) => Number(revOf(c)['合計實數']))) },
  { key: 'expenditure_per_capita', label: '每人歲出', unit: '元', ...fiscal, national: Math.round((sumAll((c) => Number(expOf(c)['合計實數'])) * 1e6) / allTotal) },
);
for (const c of COUNTIES) {
  if (!revOf(c) || !expOf(c)) continue;
  items[c].own_revenue_ratio = share(ownRevenue(c), Number(revOf(c)['合計實數']));
  items[c].expenditure_per_capita = Math.round((Number(expOf(c)['合計實數']) * 1e6) / total(c));
}
// 公共債務（1 年以上＋未滿 1 年，百萬元）；比率欄直轄市與縣市分母不同（GDP vs 歲出），只取金額換算每人負債
const debtRows = (await (await fetch('https://lgd.nta.gov.tw/newlgd/opendata/D3-09.csv')).text()).replace(/^﻿/, '').split(/\r?\n/).filter(Boolean).map((l) => l.split(','));
const debtYears = [...new Set(debtRows.slice(1).map((r) => r[0]))].sort();
const debtOf = (year, c) => { const r = debtRows.find((x) => x[0] === year && x[1] === c); return r ? Number(r[6]) : null; };
const debtYear = debtYears.at(-1);
fields.push(
  { key: 'debt', label: '公共債務餘額', unit: '百萬元', category: '財政', period: `${Number(debtYear) + 1911} 年度`, source: '財政部國庫署歷年各級政府債務概況', url: 'https://data.gov.tw/dataset/25301' },
  { key: 'debt_per_capita', label: '每人負債', unit: '元', category: '財政', period: `${Number(debtYear) + 1911} 年度`, source: '財政部國庫署歷年各級政府債務概況', url: 'https://data.gov.tw/dataset/25301',
    national: Math.round((sumAll((c) => debtOf(debtYear, c) ?? 0) * 1e6) / allTotal) },
);
for (const c of COUNTIES) {
  items[c].debt = debtOf(debtYear, c);
  items[c].debt_per_capita = items[c].debt === null ? null : Math.round((items[c].debt * 1e6) / total(c));
}
trends.debt = { label: '公共債務餘額', unit: '百萬元', points: debtYears.slice(-10).map((y) => ({ period: String(Number(y) + 1911), values: Object.fromEntries(COUNTIES.map((c) => [c, debtOf(y, c)])) })) };

/* ---------- 歷年趨勢：出生數、65 歲以上比率（近 5 個完整年度，戶政司村里資料加總） ---------- */

const trendYears = Array.from({ length: 5 }, (_, i) => now.getUTCFullYear() - 5 + i);
trends.births = { label: '出生數', unit: '人', points: [] };
trends.elderly_ratio = { label: '老年人口比率', unit: '%', points: [] };
for (const y of trendYears) {
  const births = Object.fromEntries(COUNTIES.map((c) => [c, 0]));
  for (let m = 1; m <= 12; m++) {
    const b = await villageCsv('bdmd', `${y}/${String(m).padStart(2, '0')}`);
    if (!b) throw new Error(`缺 ${y}/${m} 的出生死亡資料`);
    for (const c of COUNTIES) births[c] += b[c]['出生數'];
  }
  trends.births.points.push({ period: String(y), values: births });
  const dec = await villageCsv('population', `${y}/12`);
  if (!dec) throw new Error(`缺 ${y}/12 的村里人口資料`);
  trends.elderly_ratio.points.push({ period: String(y), values: Object.fromEntries(COUNTIES.map((c) => [c, share(elderlyOf(dec, c), dec[c]['人口數'])])) });
}
await writeFile(TRENDS_OUT, JSON.stringify({ meta: { generated_at: new Date().toISOString() }, series: trends }));

await writeFile(OUT, JSON.stringify({ meta: { generated_at: new Date().toISOString() }, fields, items }));
console.log(`寫出 ${OUT}：${fields.length} 個指標`);
for (const c of ['臺北市', '連江縣']) console.log(c, JSON.stringify(items[c]));
