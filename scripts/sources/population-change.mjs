/**
 * 人口動態：一年前同月人口 → 人口增減、淨遷入（社會增加）、高齡化速度、扶老扶幼比、國小學齡展望。
 *
 * 社會增加＝總增加－自然增加（戶政司的遷入遷出表只有 xls/ods，這裡用恆等式推回淨遷入）。
 */
import { COUNTIES, round } from '../lib/county.mjs';
import { villageCsv } from '../lib/moi.mjs';

export const id = 'population-change';
export const name = '人口動態（增減、淨遷入、高齡化速度）';
export const provides = ['pop_growth', 'pop_growth_rate', 'net_migration', 'net_migration_rate', 'aging_speed',
  'old_dependency', 'young_dependency', 'primary_outlook'];
export const dependsOn = ['population'];

export async function collect({ items, fields, shared }) {
  const { ages, popYm, popPeriod, census, ageSum, total, allTotal, share, perMille, vital, elderlyOf, working, sumAll } = shared.population;
  const [py, pm] = popYm.split('/').map(Number);
  const lastYearYm = `${py - 1}/${String(pm).padStart(2, '0')}`;
  const agesLastYear = await villageCsv('population', lastYearYm);
  if (!agesLastYear) throw new Error(`缺 ${lastYearYm} 的村里人口資料`);
  const dyn = { category: '人口', period: `${lastYearYm.replace('/', '-')}→${popPeriod}`, source: '內政部戶政司村里單一年齡人口、出生死亡', url: 'https://github.com/kiang/data.moi.gov.tw' };
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
}
