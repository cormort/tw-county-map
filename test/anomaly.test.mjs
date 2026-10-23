/**
 * 異常偵測與快取清理的測試。兩者都是「別讓壞資料／無上限成長安靜地發生」的機制。
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { detectAnomaly, medianOf, valuesOf } from '../scripts/lib/anomaly.mjs';
import { pruneCache } from '../scripts/lib/fetch-cache.mjs';

const counties = (n, f) => Object.fromEntries(Array.from({ length: n }, (_, i) => [`縣${i}`, f(i)]));

test('medianOf：奇偶數與空陣列', () => {
  assert.equal(medianOf([]), null);
  assert.equal(medianOf([3]), 3);
  assert.equal(medianOf([1, 3, 5]), 3);
  assert.equal(medianOf([1, 2, 3, 4]), 2.5);
});

test('detectAnomaly：小幅變動不算異常', () => {
  const prev = counties(10, () => 100);
  const next = counties(10, (i) => 100 + (i % 3)); // 0–2% 變動
  const r = detectAnomaly(prev, next);
  assert.equal(r.anomaly, false);
  assert.ok(r.medianChange < 0.05);
});

test('detectAnomaly：整欄跳一個數量級要抓出來', () => {
  const prev = counties(8, () => 1000);
  const next = counties(8, () => 100000); // 上游改了單位（千元→元）
  const r = detectAnomaly(prev, next);
  assert.equal(r.anomaly, true);
  assert.ok(r.medianChange > 40);
  assert.equal(r.counties.length, 5, '通知只帶變動最大的 5 個縣市');
});

test('detectAnomaly：單一縣市飆高不誤判（用中位數）', () => {
  const prev = counties(10, () => 100);
  const next = counties(10, (i) => (i === 0 ? 100000 : 102));
  assert.equal(detectAnomaly(prev, next).anomaly, false);
});

test('detectAnomaly：可比較的縣市太少就不判斷', () => {
  const prev = counties(3, () => 100);
  const next = counties(3, () => 100000);
  const r = detectAnomaly(prev, next);
  assert.equal(r.compared, 3);
  assert.equal(r.anomaly, false, '只有 3 個縣市比對，寧可相信資料也不要亂擋');
});

test('detectAnomaly：null、0、缺值都不列入比較', () => {
  const prev = { 甲: 100, 乙: 0, 丙: null, 丁: 50, 戊: 50, 己: 50, 庚: 50, 辛: 50 };
  const next = { 甲: 1000, 乙: 999, 丙: 999, 丁: 50, 戊: 50, 己: 50, 庚: 50, 辛: 50 };
  const r = detectAnomaly(prev, next);
  assert.equal(r.compared, 6, '乙（前一版 0）與丙（前一版 null）不列入');
  assert.equal(r.anomaly, false, '只有甲變 10 倍，中位數仍是 0');
});

test('valuesOf：把 items 抽成單一欄位的縣市表', () => {
  const items = { 甲: { a: 1, b: 2 }, 乙: { a: 3 } };
  assert.deepEqual(valuesOf(items, 'a'), { 甲: 1, 乙: 3 });
  assert.deepEqual(valuesOf(items, 'b'), { 甲: 2, 乙: undefined });
  assert.deepEqual(valuesOf(undefined, 'a'), {});
});

test('pruneCache：超過檔案數上限時刪最舊的', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cache-test-'));
  for (let i = 0; i < 5; i++) {
    await writeFile(join(dir, `f${i}`), 'x'.repeat(10));
    // mtime 精度只到毫秒，錯開才排得出新舊
    await new Promise((r) => setTimeout(r, 12));
  }
  const r = await pruneCache({ dir, maxFiles: 3, maxBytes: 1e9, maxAgeDays: 400 });
  assert.equal(r.removed, 2);
  assert.equal(r.kept, 3);
  const left = (await readdir(dir)).sort();
  assert.deepEqual(left, ['f2', 'f3', 'f4'], '留最新的三個');
});

test('pruneCache：超過總容量時從最舊的刪', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cache-test-'));
  for (let i = 0; i < 4; i++) {
    await writeFile(join(dir, `g${i}`), 'x'.repeat(100));
    await new Promise((r) => setTimeout(r, 12));
  }
  const r = await pruneCache({ dir, maxFiles: 100, maxBytes: 250, maxAgeDays: 400 });
  assert.equal(r.removed, 2);
  assert.ok(r.bytes <= 250);
});

test('pruneCache：太舊的檔案直接清掉、_index 之類的不動', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'cache-test-'));
  await writeFile(join(dir, '_urls.json'), '{}');
  await writeFile(join(dir, 'old'), 'x');
  // now 往後一天 → 連剛寫入的檔都算「過期」；用參數而不是真的等，測試才不會看執行速度
  const r = await pruneCache({ dir, maxFiles: 100, maxBytes: 1e9, maxAgeDays: 0, now: Date.now() + 86_400_000 });
  assert.equal(r.removed, 1);
  assert.deepEqual(await readdir(dir), ['_urls.json']);
});

test('pruneCache：目錄不存在時不拋錯', async () => {
  const r = await pruneCache({ dir: join(tmpdir(), 'no-such-cache-dir-xyz') });
  assert.equal(r.skipped, true);
});
