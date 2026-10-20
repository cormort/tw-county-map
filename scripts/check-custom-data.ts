// 自訂資料解析的自我檢查：node scripts/check-custom-data.ts
import assert from 'node:assert/strict';
import { csvRows, matchCounty, parseRows, toCountyStats } from '../src/lib/customData.ts';

const C = ['臺北市', '新北市', '新竹市', '新竹縣', '臺中市'];
assert.equal(matchCounty(' 台北 ', C), '臺北市');
assert.equal(matchCounty('新竹', C), null); // 市、縣都對得上，不猜
assert.equal(matchCounty('總計', C), null);

assert.deepEqual(csvRows('a,b\n"x,1","he said ""hi"""\r\n'), [{ a: 'x,1', b: 'he said "hi"' }]);

const csv = '縣市,病床數,備註\n總計,100,\n台北市,"1,234",\n新北市,56.5,\n臺中市,-,\n新竹縣,7,x';
const r = toCountyStats(parseRows(csv), C, 't.csv');
assert.equal(r.countyColumn, '縣市');
assert.deepEqual(r.unmatched, ['總計']);
assert.deepEqual(r.stats.fields.map((f) => f.label), ['病床數']);
assert.equal(r.stats.items['臺北市']['custom.t.csv.病床數'], 1234);
assert.equal(r.stats.items['臺中市']['custom.t.csv.病床數'], null);
assert.equal(r.stats.fields[0].digits, 2);

const json = JSON.stringify({ result: { records: [{ name: '臺北市', v: '1' }, { name: '新北市', v: '2' }, { name: '臺中市', v: '3' }] } });
assert.equal(toCountyStats(parseRows(json), C, 'j').stats.items['新北市']['custom.j.v'], 2);

assert.throws(() => toCountyStats(parseRows('a,b\n1,2'), C, 'x'), /縣市欄位/);
console.log('custom data ok');
