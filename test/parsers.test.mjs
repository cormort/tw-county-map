/**
 * 解析器測試：只餵文字／陣列，不下載任何東西、不看今天幾號。
 *
 * 目的：政府網站改欄位名、改格式時要在這裡紅，而不是等人發現網站上的數字怪怪的。
 * 每個 fixture 都是手寫的最小樣本（2–3 個縣市），斷言值是算得出來的那種，不是抄某一年的真實數字。
 *
 * 跑法：node --test test/   或   npm test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

import { COUNTIES, csvLine, normCounty, per10k, perMille, rocToIso, share } from '../scripts/lib/county.mjs';
import { parseVillageCsv } from '../scripts/lib/moi.mjs';
import { tableFromLines } from '../scripts/sources/medical.mjs';
import { parseSchoolRows } from '../scripts/sources/education.mjs';
import { parseElecRows } from '../scripts/sources/electricity.mjs';
import { parseNpRows } from '../scripts/sources/pension.mjs';
import { parseGcisRows } from '../scripts/sources/business.mjs';
import { parseNdcCsv, parseDebtRows } from '../scripts/sources/fiscal.mjs';
import { parseNhiRows } from '../scripts/sources/health-insurance.mjs';
import { parseLaborRows } from '../scripts/sources/labor.mjs';
import { parseLvrRows } from '../scripts/sources/house-price.mjs';
import { parseFactoryRows } from '../scripts/sources/factories.mjs';
import { indigenousLineOf } from '../scripts/sources/indigenous.mjs';
import { sources } from '../scripts/sources/index.mjs';

test('csvLine：雙引號裡有逗號', () => {
  assert.deepEqual(csvLine('"臺北市","1,234",56'), ['臺北市', '1,234', '56']);
  assert.deepEqual(csvLine('a,"b,c",d'), ['a', 'b,c', 'd']);
});

test('normCounty：台→臺、去掉 [1] 註記、去空白', () => {
  assert.equal(normCounty('台北市'), '臺北市');
  assert.equal(normCounty('[1]新北市'), '新北市');
  assert.equal(normCounty(' 高雄市 '), '高雄市');
});

test('比率工具：per10k／perMille／share 的位數', () => {
  assert.equal(per10k(1234, 2_500_000), 4.94);
  assert.equal(perMille(1234, 2_500_000), 0.49);
  assert.equal(share(1234, 2500), 49.36);
  assert.equal(rocToIso('11509'), '2026-09');
});

test('parseVillageCsv：英文欄名轉中文、村里列按前 3 字加總到縣市', () => {
  // 欄位順序照真實檔案：0 統計年月、1 區域別代碼、2 區域別、3 村里、4 戶數，第 5 欄起才是要加總的數字
  const csv = [
    'statistic_yyymm,district_code,site_id,village,household_no,people_total,people_total_m,people_total_f,people_age_000_m,people_age_000_f,people_age_065_m',
    '11112,65000010001,臺北市大安區,甲里,10,100,60,40,7,6,5',
    '11112,65000010002,臺北市信義區,乙里,20,50,30,20,3,2,1',
    '11112,09007010001,連江縣南竿鄉,丙里,5,10,6,4,1,1,0',
  ].join('\n');
  const sums = parseVillageCsv(csv);
  assert.equal(sums['臺北市']['人口數'], 150, '兩個村里要加總');
  assert.equal(sums['臺北市']['人口數-男'], 90);
  assert.equal(sums['臺北市']['0歲-男'], 10);
  assert.equal(sums['臺北市']['0歲-女'], 8);
  assert.equal(sums['臺北市']['65歲-男'], 6);
  assert.equal(sums['連江縣']['人口數'], 10);
  assert.equal(sums['新北市']['人口數'], undefined, '沒出現的縣市不該有值');
});

test('parseElecRows：引號千分位、台→臺、非縣市列要濾掉', () => {
  const csv = [
    '年月,縣市,用電性質,售電量',
    '11509,台北市,住宅,"636,471,432"',
    '11509,臺北市,工業,"1,000"',
    '11509,連江縣,住宅,500',
    '11509,台灣省,住宅,"9,999"',
    '合計,合計,合計,0',
  ].join('\n');
  const elec = parseElecRows(csv);
  assert.deepEqual([...elec.keys()], ['11509']);
  const month = elec.get('11509');
  assert.deepEqual(month.get('臺北市'), { 住宅: 636471432, 工業: 1000 });
  assert.equal(month.get('連江縣').住宅, 500);
  assert.equal(month.has('台灣省'), false);
});

test('parseGcisRows：縮排空白與 [1] 註記都吃得下', () => {
  const rows = [
    [' 縣市別', '家數', '資本額'],
    ['  臺北市', '1,234', '5,678'],
    ['[1]新北市', '99', '100'],
    ['  台灣省', '1', '1'],
  ].map((r) => r.map((x) => String(x).replace(/,/g, '')));
  const out = parseGcisRows(rows);
  assert.deepEqual(out['臺北市'], { count: 1234, capital: 5678 });
  assert.deepEqual(out['新北市'], { count: 99, capital: 100 });
  assert.equal(out['台灣省'], undefined);
});

test('parseSchoolRows：一個檔多學年度只算最新那年、台→臺', () => {
  const rows = [
    ['學年度', '縣市名稱', '學校名稱'],
    ['112', '臺北市', '甲國小'],
    ['113', '臺北市', '乙國小'],
    ['113', '台北市', '丙國小'],
    ['113', '連江縣', '丁國小'],
    ['112', '臺北市', '戊國小'],
  ];
  const { year, out } = parseSchoolRows(rows);
  assert.equal(year, 113);
  assert.equal(out['臺北市'], 2);
  assert.equal(out['連江縣'], 1);
  assert.equal(out['新北市'], 0);
  assert.throws(() => parseSchoolRows([['學年度', '學校名稱']]), /縣市名稱/);
});

test('parseNpRows：PDF 的 CJK 相容字要 NFKC 正規化', () => {
  const lines = [
    '  縣市別      被保險人數',
    `  臺\uF963市    1,234`, // 「北」是相容字
    '  連江縣      56',
    '  臺灣地區    1,290',
  ];
  const rows = parseNpRows(lines);
  assert.equal(rows['臺北市'], 1234);
  assert.equal(rows['連江縣'], 56);
  assert.equal(Object.keys(rows).length, 2);
});

test('parseNdcCsv：欄名取自第一列，欄數不足不會爆', () => {
  const csv = '年,地區,合計實數,補助及協助收入實數\n113,臺北市,100,40\n113,新北市,200,50\n';
  const rows = parseNdcCsv(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]['地區'], '臺北市');
  assert.equal(rows[1]['合計實數'], '200');
});

test('parseDebtRows：保留原始欄位順序（年度、縣市、…、第 6 欄是餘額）', () => {
  const rows = parseDebtRows('年度,縣市,a,b,c,d,餘額\n113,臺北市,0,0,0,0,12345\n');
  assert.equal(rows[0][0], '年度');
  assert.equal(rows[1][1], '臺北市');
  assert.equal(rows[1][6], '12345');
});

test('parseNhiRows：同縣市多列加總、資料年月取最後一列', () => {
  const lines = [
    'ym,縣市,鄉鎮,性別,年齡,別,人數',
    '11508,臺北市,大安區,男,30,一般,100',
    '11508,臺北市,信義區,女,40,一般,50',
    '11508,連江縣,南竿鄉,男,30,一般,7',
  ];
  const { ym, nhi } = parseNhiRows(lines);
  assert.equal(ym, '11508');
  assert.equal(nhi['臺北市'], 150);
  assert.equal(nhi['連江縣'], 7);
  assert.equal(nhi['新北市'], 0);
});

test('parseLaborRows：只算最新月份的列、同縣市多列加總、代碼對不上就拋錯', () => {
  const code = Object.fromEntries(COUNTIES.map((c, i) => [String(i + 1), c]));
  const rows = COUNTIES.flatMap((c, i) => [
    { 資料年月: '11508', 地區別: String(i + 1), 本月底投保人數: '500' }, // 上個月，不該算
    { 資料年月: '11509', 地區別: String(i + 1), 本月底投保人數: '600' },
    { 資料年月: '11509', 地區別: String(i + 1), 本月底投保人數: '400' },
  ]);
  const { ym, out } = parseLaborRows(rows, code);
  assert.equal(ym, '11509');
  assert.equal(out[COUNTIES[0]], 1000, '同一縣市同月份要加總');
  assert.equal(out[COUNTIES.at(-1)], 1000);
  // 代碼表少一個縣市 → 那個縣市是 0 → 要拋錯，不要寫入錯的數字
  assert.throws(() => parseLaborRows(rows, { 1: COUNTIES[0] }), /地區別代碼對不上/);
});

test('tableFromLines：跳過目錄列、縣市名有空白也認得、"-" 當 0', () => {
  const lines = [
    '表20醫療院所家數 ................ 30',
    '  表20醫療院所家數 Hospitals Clinics',
    '  臺北市  Total  1,234  56',
    '  連江縣  Total  -  5',
    '  新北市  Total  999  88',
  ];
  const rows = tableFromLines(lines, '表20醫療院所家數', 3);
  assert.deepEqual(rows['臺北市'], [1234, 56]);
  assert.deepEqual(rows['連江縣'], [0, 5]);
  assert.equal(rows['新北市'][0], 999);
  assert.throws(() => tableFromLines(lines, '表24醫療院所病床數'), /找不到/);
  assert.throws(() => tableFromLines(lines, '表20醫療院所家數', 4), /只讀到 3 個縣市/);
});

test('parseLvrRows：只算建物、房價只看住家用且排除親友，件數照算', () => {
  const header = '交易標的,單價元平方公尺,總價元,主要用途,備註';
  const csv = [
    header,
    'subject,unit_price,price,usage,note', // 第二列英文欄名，要跳過
    '房地(土地+建物),330578.5,11000000,住家用,', // 正常住宅 → 單價 33.05 萬／坪（330578.5×3.305785÷10000）
    '土地,200000,5000000,住家用,', // 純土地 → 不算件數也不進房價
    '房地(土地+建物),300000,9000000,住家用,親友間交易', // 件數算，房價不算
    '房地(土地+建物),400000,15000000,住商用,', // 件數算，房價不算
    '房地(土地+建物),0,8000000,住家用,', // 單價 0 → 房價不算
  ].join('\n');
  const out = parseLvrRows(csv);
  assert.equal(out.deals, 4, '四個建物交易（土地那列不算）');
  assert.equal(out.prices.length, 1);
  assert.equal(out.totals[0], 11000000);
  assert.ok(Math.abs(out.prices[0] - 330578.5 * 3.305785 / 10000) < 1e-9);
});

test('parseFactoryRows：縣市取「工廠市鎮鄉村里」前 3 字，缺欄要拋錯', () => {
  const lines = [
    '工廠名稱,工廠市鎮鄉村里,產業類別',
    '甲公司,臺北市內湖區,電子',
    '乙公司,臺北市北投區,紡織',
    '丙公司,連江縣南竿鄉,食品',
    '丁公司,臺灣省,其他',
  ];
  const counts = parseFactoryRows(lines);
  assert.equal(counts['臺北市'], 2);
  assert.equal(counts['連江縣'], 1);
  assert.equal(counts['新北市'], 0);
  assert.throws(() => parseFactoryRows(['工廠名稱,產業類別', '甲公司,電子']), /工廠市鎮鄉村里/);
});

test('indigenousLineOf：平地＋山地原住民才算，平埔與非縣市列跳過', () => {
  const line = (area, identity, n) => `x,y,${area},v,戶,${identity},性別,${n}`;
  assert.deepEqual(indigenousLineOf(line('臺北市大安區', '平地原住民', 100)), { county: '臺北市', count: 100 });
  assert.deepEqual(indigenousLineOf(line('連江縣南竿鄉', '山地原住民', 7)), { county: '連江縣', count: 7 });
  assert.equal(indigenousLineOf(line('臺北市大安區', '平埔原住民', 3)), null, '平埔不併入');
  assert.equal(indigenousLineOf(line('臺北市大安區', '非原住民', 999)), null);
  assert.equal(indigenousLineOf('a,b,台灣省,v,戶,平地原住民,性別,5'), null);
});

test('來源註冊表：id 不重複、dependsOn 指得到、provides 對得上實際欄位', async () => {
  const ids = sources.map((s) => s.id);
  assert.equal(new Set(ids).size, ids.length, `id 重複：${ids.join(',')}`);
  for (const s of sources) {
    assert.ok(s.name && s.collect, `${s.id} 缺 name 或 collect`);
    for (const dep of s.dependsOn ?? []) {
      assert.ok(ids.includes(dep), `${s.id} 宣告相依 ${dep}，但沒有這個來源`);
    }
  }
  const data = JSON.parse(await readFile(new URL('../public/data/county-stats.json', import.meta.url), 'utf8'));
  const keys = new Set(data.fields.map((f) => f.key));
  const missing = [];
  for (const s of sources) for (const key of s.provides ?? []) if (!keys.has(key)) missing.push(`${s.id}:${key}`);
  assert.deepEqual(missing, [], `provides 宣告了但資料裡沒有：${missing.join('、')}`);
});
