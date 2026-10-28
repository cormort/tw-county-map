/**
 * 人口結構：戶政司村里單一年齡人口（kiang 轉存）＋ 近 12 個月出生死亡 ＋ 移民署新住民。
 *
 * 這是整個站的地基：`ages`／`total()`／`ageSum()`／`share()`／`elderlyOf()` 都從這裡出去，
 * 人口動態、長照、財政、用電、產業、教育、歷年趨勢全都靠它。其他模組要用人數一律走 `shared.population`，
 * 不要自己再抓一次（同一份檔案抓兩次只會半月分資料不一致）。
 *
 * 年底人口另外由醫療模組提供（衛福部年報自己的數字），那是給「每萬人」比率當分母用的，兩者不要混。
 */
import { COUNTIES, monthsBack, round } from '../lib/county.mjs';
import { fetchRetry } from '../lib/fetch-cache.mjs';
import { villageCsv } from '../lib/moi.mjs';
import { parseSpouseCsv } from '../lib/spouse.mjs';

export const id = 'population';
export const name = '人口結構（戶政司村里＋移民署新住民）';
export const provides = ['male', 'female', 'sex_ratio',
  'age_preschool', 'age_preschool_ratio', 'age_primary', 'age_primary_ratio',
  'age_junior', 'age_junior_ratio', 'age_senior', 'age_senior_ratio',
  'age_college', 'age_college_ratio', 'births', 'deaths', 'natural_increase', 'birth_rate', 'death_rate',
  'new_residents', 'foreign_spouses', 'mainland_spouses', 'new_residents_per1000'];
export const dependsOn = [];

export async function collect({ items, fields }) {
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

  // 新住民（外籍配偶＋大陸港澳配偶，累計人數）：內政部統計查詢網。
  // 上游通常落後兩個月，而且**當月未發布時會回一列全是 "-" 的空殼**（實測 115年9月整月皆 "-"），
  // 所以這裡往回試最多 4 個月，只採用真的有數字的那個月；全空就丟錯讓上層沿用上一版。
  let spouse = { hasData: false, byCounty: {}, period: null };
  let spousePeriod = '';
  for (let n = 0; n < 4 && !spouse.hasData; n++) {
    const ym = monthsBack(n).replace('/', '');
    const rocYm = `${Number(ym.slice(0, 4)) - 1911}${ym.slice(4)}`;
    const text = await (await fetchRetry(`https://statis.moi.gov.tw/micst/webMain.aspx?sys=220&kind=21&type=1&funid=c0930301&cycle=41&outmode=12&utf=1&compmode=0&outkind=3&fldspc=0,12,&codspc0=0,2,3,2,6,1,9,1,12,1,15,17,&codlst1=111&ym=${rocYm}&ymt=${rocYm}`)).text();
    spouse = parseSpouseCsv(text);
    if (spouse.hasData) spousePeriod = spouse.period;
  }
  if (!spouse.hasData) throw new Error('新住民資料連續 4 個月都是空的（上游未發布或格式變了）');
  for (const [county, v] of Object.entries(spouse.byCounty)) {
    if (!items[county]) continue;
    if (v.total !== null) items[county].new_residents = v.total;
    if (v.foreign !== null) items[county].foreign_spouses = v.foreign;
    if (v.mainland !== null) items[county].mainland_spouses = v.mainland;
  }
  const nr = { category: '人口', period: `${spousePeriod} 累計`, source: '內政部移民署外籍與大陸港澳配偶人數', url: 'https://data.gov.tw/dataset/13503' };
  fields.push(
    { key: 'new_residents', label: '新住民（外籍＋大陸港澳配偶）', unit: '人', ...nr },
    { key: 'foreign_spouses', label: '外籍配偶', unit: '人', ...nr },
    { key: 'mainland_spouses', label: '大陸港澳配偶', unit: '人', ...nr },
    { key: 'new_residents_per1000', label: '每千人新住民', unit: '人／千人', digits: 1, ...nr,
      national: perMille(COUNTIES.reduce((s, c) => s + items[c].new_residents, 0), allTotal) },
  );
  for (const c of COUNTIES) items[c].new_residents_per1000 = perMille(items[c].new_residents, total(c));
  const elderlyOf = (src, c) => { let n = 0; for (let a = 65; a <= 99; a++) n += (src[c][`${a}歲-男`] ?? 0) + (src[c][`${a}歲-女`] ?? 0); return n + (src[c]['100歲以上-男'] ?? 0) + (src[c]['100歲以上-女'] ?? 0); };
  const working = (c) => ageSum(c, 15, 64);
  const sumAll = (f) => COUNTIES.reduce((s, c) => s + f(c), 0);

  return {
    shared: { ages, popYm, popPeriod, census, ageSum, total, allTotal, share, perMille, vital, elderlyOf, working, sumAll },
  };
}
