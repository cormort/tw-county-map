/**
 * 使用者手動載入的資料（JSON／XML／CSV）→ 跟 county-stats.json 同形狀，前端就能當指標用。
 * 規則：找出「最多值對得上縣市名」的那一欄當縣市欄，其餘大多是數字的欄位都當指標。
 */
import type { CountyStatsResponse } from '../api/types';

type Row = Record<string, unknown>;

/** 依內容判斷格式：{ / [ 是 JSON，< 是 XML，其餘當 CSV（有 tab 就當 TSV） */
export function parseRows(text: string): Row[] {
  const t = text.replace(/^﻿/, '').trim();
  if (t.startsWith('{') || t.startsWith('[')) return findRows(JSON.parse(t)) ?? [];
  if (t.startsWith('<')) return xmlRows(t);
  return csvRows(t);
}

/** JSON：本身是物件陣列，或物件裡某一層有物件陣列（開放資料 API 常包在 records、data…裡） */
function findRows(v: unknown): Row[] | null {
  if (Array.isArray(v)) return v.length && v.every((x) => x && typeof x === 'object' && !Array.isArray(x)) ? (v as Row[]) : null;
  if (v && typeof v === 'object') {
    for (const child of Object.values(v)) {
      const rows = findRows(child);
      if (rows) return rows;
    }
  }
  return null;
}

/** XML：出現最多次、底下還有子元素的標籤當「一列」，子元素名稱當欄名 */
function xmlRows(text: string): Row[] {
  const doc = new DOMParser().parseFromString(text, 'application/xml');
  if (doc.querySelector('parsererror')) throw new Error('XML 格式錯誤');
  const counts = new Map<string, Element[]>();
  for (const el of Array.from(doc.getElementsByTagName('*'))) {
    if (!el.children.length) continue;
    counts.set(el.tagName, [...(counts.get(el.tagName) ?? []), el]);
  }
  const rows = [...counts.values()].sort((a, b) => b.length - a.length)[0] ?? [];
  return rows.map((el) => Object.fromEntries([
    ...Array.from(el.attributes).map((a) => [a.name, a.value]),
    ...Array.from(el.children).map((c) => [c.tagName, c.textContent ?? '']),
  ]));
}

/** CSV（支援雙引號欄位與欄位內換行） */
export function csvRows(text: string): Row[] {
  const sep = text.split('\n', 1)[0].includes('\t') ? '\t' : ',';
  const table: string[][] = [[]];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === sep) { table.at(-1)!.push(cell); cell = ''; }
    else if (ch === '\n') { table.at(-1)!.push(cell.replace(/\r$/, '')); table.push([]); cell = ''; }
    else cell += ch;
  }
  table.at(-1)!.push(cell);
  const [header, ...body] = table.filter((r) => r.some((c) => c.trim()));
  return body.map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] ?? ''])));
}

/** 「台北」「臺北市」「 臺北市 」都對到臺北市；「新竹」同時對到市與縣，不猜 */
export function matchCounty(value: unknown, counties: string[]): string | null {
  const n = String(value ?? '').replace(/\s/g, '').replace(/台/g, '臺');
  if (!n) return null;
  const hits = counties.filter((c) => c === n || c.slice(0, -1) === n);
  return hits.length === 1 ? hits[0] : null;
}

const toNumber = (v: unknown) => {
  if (typeof v === 'number') return v;
  const s = String(v ?? '').replace(/[,%\s]/g, '');
  return s === '' || s === '-' ? null : Number(s);
};

export interface CustomResult {
  stats: CountyStatsResponse;
  countyColumn: string;
  matched: number;
  /** 縣市欄裡對不上的值（例如「總計」、「新竹」），讓使用者知道哪些列沒算進去 */
  unmatched: string[];
  duplicated: string[];
  /** 數字不到八成、沒當成指標的欄（讓使用者知道為什麼少了） */
  skipped: string[];
}

export function toCountyStats(rows: Row[], counties: string[], name: string): CustomResult {
  if (!rows.length) throw new Error('讀不到任何資料列');
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))];
  const score = (col: string) => rows.filter((r) => matchCounty(r[col], counties)).length;
  const countyColumn = columns.reduce((best, col) => (score(col) > score(best) ? col : best), columns[0]);
  if (score(countyColumn) < 3) throw new Error('找不到縣市欄位：需要有一欄是縣市名稱（例如「臺北市」）');

  const items: CountyStatsResponse['items'] = {};
  const unmatched = new Set<string>();
  const duplicated = new Set<string>();
  const kept: Row[] = [];
  for (const r of rows) {
    const county = matchCounty(r[countyColumn], counties);
    if (!county) { if (String(r[countyColumn] ?? '').trim()) unmatched.add(String(r[countyColumn]).trim()); continue; }
    if (items[county]) duplicated.add(county); // 同一縣市多列：後面蓋前面
    items[county] = {};
    kept.push({ ...r, [countyColumn]: county });
  }
  const fields: CountyStatsResponse['fields'] = [];
  const skipped: string[] = [];
  for (const col of columns) {
    if (col === countyColumn) continue;
    const values = kept.map((r) => toNumber(r[col])).filter((v) => v !== null);
    // 八成以上是數字才當指標（年度、代碼這種欄位也會進來，使用者不選就好）
    if (!values.length || values.filter(Number.isFinite).length < values.length * 0.8) { skipped.push(col); continue; }
    const key = `custom.${name}.${col}`;
    fields.push({ key, label: col, unit: '', period: `自訂：${name}`, source: name, url: '', digits: values.some((v) => !Number.isInteger(v)) ? 2 : 0 });
    for (const r of kept) {
      const v = toNumber(r[col]);
      items[r[countyColumn] as string][key] = v !== null && Number.isFinite(v) ? v : null;
    }
  }
  if (!fields.length) throw new Error('除了縣市欄以外，找不到數值欄位');
  return { stats: { meta: { generated_at: new Date().toISOString() }, fields, items }, countyColumn, matched: Object.keys(items).length, unmatched: [...unmatched], duplicated: [...duplicated], skipped };
}

/** 合併多份統計（county-stats.json ＋ 使用者載入的） */
export function mergeStats(list: (CountyStatsResponse | null | undefined)[]): CountyStatsResponse {
  const out: CountyStatsResponse = { meta: { generated_at: '' }, fields: [], items: {} };
  for (const s of list) {
    if (!s) continue;
    out.fields.push(...s.fields);
    for (const [county, values] of Object.entries(s.items)) out.items[county] = { ...out.items[county], ...values };
  }
  return out;
}
