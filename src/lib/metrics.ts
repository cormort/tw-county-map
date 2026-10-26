import type { CountiesResponse, CountyElection, CountyElectionKey, CountyItem, CountyStatsResponse } from '../api/types';
import { partyStyle } from './parties';
import { fmt, perArea, ratio, sumBy, type Unit } from './format';

/**
 * 指標模型：人口與選舉從 counties.json 推算，其他主題由 county-stats.json（＋使用者自訂資料）的欄位自動長出來。
 * 所有分頁（地圖、總覽、比較）都吃同一份 Metric[]。
 */
export interface Metric {
  key: string;
  label: string;
  /** 卡片用：不含資料時點的短名稱與時點 */
  short?: string;
  period?: string;
  /** 主題（人口、選舉、醫療…），指標選單的第一層分組 */
  category: string;
  /** 次分類（人口結構、長照體系…），指標選單的第二層分組 */
  subcategory?: string;
  /** 比率／密度（rate）或總量（count）：總量會跟著人口規模走，不適合拿來評比縣市表現 */
  kind: 'rate' | 'count';
  unit: Unit;
  /** 非比率的小數位數（面積 2 位、密度 1 位）；比率固定 2 位 */
  digits?: number;
  value: (c: CountyItem) => number | null;
  /** 選舉指標：所屬選舉與欄位，用來配對前後兩次（時間差異） */
  election?: CountyElectionKey;
  field?: string;
  /** 加總沒有意義的指標（例如人口密度）用這個取代「全國加總」 */
  national?: { value: (items: CountyItem[]) => number | null; label: string };
  /** 選舉第一名政黨版圖：地圖改用政黨色，數值統計沒有意義 */
  partyOf?: (c: CountyItem) => string | null;
  /** 這一欄這次沒抓到、沿用上一版（顯示「沿用 YYYY/MM/DD」） */
  carriedAt?: string | null;
  /** 數值變動過大、已被 runner 暫停更新 */
  anomaly?: boolean;
  /** 資料來源（指標說明用；選舉與人口指標沒有） */
  source?: string;
}

export const ELECTIONS: CountyElectionKey[] = ['president_2024', 'president_2020', 'mayor_2022', 'mayor_2018'];
/** 時間差異：新 ← 舊 */
export const PREVIOUS: Partial<Record<CountyElectionKey, CountyElectionKey>> = { president_2024: 'president_2020', mayor_2022: 'mayor_2018' };
export const PARTIES = ['民主進步黨', '中國國民黨', '台灣民眾黨'];
/** 主題的顯示順序（指標選單的分組、搜尋篩選） */
export const TOPICS = ['人口', '醫療', '教育', '房價', '經濟', '財政', '交通', '產業', '能源', '環境', '農業', '選舉', '自訂'];

export const formatMetric = (m: Pick<Metric, 'unit' | 'digits'>, v: number | null) => fmt(v, m.unit, m.digits);
export const formatterOf = (m: Pick<Metric, 'unit' | 'digits'>) => (v: number | null) => fmt(v, m.unit, m.digits);

export function partyVotes(e: CountyElection, party: string): { votes: number; pct: number } | null {
  const list = e.candidates.filter((c) => c.party === party);
  if (!list.length) return null;
  return { votes: list.reduce((s, c) => s + c.votes, 0), pct: list.reduce((s, c) => s + c.pct, 0) };
}

function inferKind(unit: Unit, key: string): 'rate' | 'count' {
  if (unit === '%' || unit === '百分點' || unit === '‰' || unit.includes('率') || unit.includes('比') || unit.includes('／') || unit.includes('倍') || key.includes('rate') || key.includes('ratio') || key.includes('pct') || key.includes('density') || key.includes('speed')) {
    return 'rate';
  }
  return 'count';
}

function inferSubcategory(m: { category: string; label: string; key: string }): string {
  if (m.category === '人口') {
    if (m.label.includes('學齡') || m.label.includes('國小')) return '少子化與學齡';
    if (m.label.includes('老') || m.label.includes('高齡') || m.label.includes('扶')) return '高齡與扶養';
    if (m.label.includes('出生') || m.label.includes('死亡') || m.label.includes('遷') || m.label.includes('增減')) return '人口動態與消長';
    if (m.label.includes('住民') || m.label.includes('配偶') || m.label.includes('性比例') || m.label.includes('男性') || m.label.includes('女性')) return '性別與族群';
    return '其他人口指標';
  }
  if (m.category === '醫療') {
    if (m.label.includes('長照')) return '長照體系';
    if (m.label.includes('健保')) return '全民健保';
    return '醫療量能與醫事人員';
  }
  if (m.category === '產業') {
    if (m.label.includes('工廠')) return '製造與工廠';
    if (m.label.includes('勞保') || m.label.includes('就業')) return '勞工就業';
    return '企業與商業登記';
  }
  if (m.category === '教育') return m.label.includes('學齡兒童') ? '學童分佈' : '各級學校數';
  if (m.category === '經濟') {
    if (m.label.includes('綜稅') || m.label.includes('申報') || m.label.includes('所得總額')) return '綜合所得申報';
    if (m.label.includes('國保') || m.label.includes('國民年金')) return '國民年金';
    return '所得與就業環境';
  }
  if (m.category === '財政') {
    if (m.label.includes('綜稅') || m.label.includes('所得稅')) return '國稅與綜所稅';
    if (m.label.includes('地方稅') || m.label.includes('稅課')) return '稅課收入';
    if (m.label.includes('債務') || m.label.includes('負債')) return '公共債務';
    return '歲入與歲出決算';
  }
  if (m.category === '交通') {
    if (m.label.includes('充電')) return '充電設施';
    if (m.label.includes('機車')) return '機車登記';
    if (m.label.includes('客車') || m.label.includes('汽車')) return '汽車登記';
    if (m.label.includes('費用')) return '交通支出';
    return '機動車輛';
  }
  if (m.category === '能源') {
    if (m.label.includes('光電') || m.label.includes('太陽')) return '太陽光電';
    if (m.label.includes('再生能源') || m.label.includes('綠能')) return '再生能源';
    return '電力與用電';
  }
  if (m.category === '環境') {
    if (m.label.includes('垃圾') || m.label.includes('回收') || m.label.includes('廚餘')) return '廢棄物與回收';
    if (m.label.includes('污水') || m.label.includes('下水道')) return '水質與污水處理';
    if (m.label.includes('空氣') || m.label.includes('懸浮微粒') || m.label.includes('AQI')) return '空氣品質';
    return '環境品質';
  }
  return m.category;
}

/** 由資料列出所有可分析的數值指標；匯出給 render smoke 驗指標清單 */
export function buildMetrics(data: CountiesResponse, stats?: CountyStatsResponse): Metric[] {
  const metrics: Metric[] = [
    { key: 'population', category: '人口', subcategory: '基本與密度', kind: 'count', label: '人口數', unit: '人', value: (c) => c.population },
    { key: 'households', category: '人口', subcategory: '基本與密度', kind: 'count', label: '戶數', unit: '戶', value: (c) => c.households },
    { key: 'area_km2', category: '人口', subcategory: '基本與密度', kind: 'count', label: '面積', unit: '平方公里', digits: 2, value: (c) => c.area_km2 },
    {
      key: 'density', category: '人口', subcategory: '基本與密度', kind: 'rate', label: '人口密度', unit: '人／平方公里', digits: 1,
      value: (c) => perArea(c.population, c.area_km2),
      // 22 個縣市密度相加沒有意義：全國改成「總人口 ÷ 總面積」
      national: { label: '全國（總人口 ÷ 總面積）', value: (items) => perArea(sumBy(items, (c) => c.population), sumBy(items, (c) => c.area_km2)) },
    },
    { key: 'voting_age', category: '人口', subcategory: '人口結構', kind: 'count', label: '選舉年齡人口（20 歲以上）', unit: '人', value: (c) => c.voting_age },
    { key: 'voting_age_ratio', category: '人口', subcategory: '人口結構', kind: 'rate', label: '選舉年齡人口比率', unit: '%', value: (c) => ratio(c.voting_age, c.population),
      national: { label: '全國', value: (items) => ratio(sumBy(items, (c) => c.voting_age), sumBy(items, (c) => c.population)) } },
    { key: 'elderly', category: '人口', subcategory: '高齡與扶養', kind: 'count', label: '老年人口（65 歲以上）', unit: '人', value: (c) => c.elderly },
    { key: 'elderly_ratio', category: '人口', subcategory: '高齡與扶養', kind: 'rate', label: '老年人口比率', unit: '%', value: (c) => ratio(c.elderly, c.population),
      national: { label: '全國', value: (items) => ratio(sumBy(items, (c) => c.elderly), sumBy(items, (c) => c.population)) } },
  ];
  for (const f of stats?.fields ?? []) {
    const category = f.key.startsWith('custom.') ? '自訂' : f.category ?? '其他';
    metrics.push({
      key: f.key,
      label: `${f.label}（${f.period}）`,
      short: f.label,
      period: f.period,
      category,
      subcategory: inferSubcategory({ category, label: f.label, key: f.key }),
      kind: inferKind(f.unit, f.key),
      unit: f.unit,
      digits: f.digits,
      value: (c) => stats?.items[c.county]?.[f.key] ?? null,
      national: f.national === undefined ? undefined : { label: '全國', value: () => f.national ?? null },
      carriedAt: f.carried_at ?? null,
      anomaly: Boolean(f.anomaly),
      source: f.source,
    });
  }
  for (const election of ELECTIONS) {
    const label = data.elections[election].label;
    const base = { category: '選舉', subcategory: label, election };
    const of = (c: CountyItem) => c.elections[election];

    metrics.push({
      ...base, key: `${election}.winner`, label: `${label}・第一名勝選政黨版圖`, unit: '%', kind: 'rate', field: 'winner',
      value: (c) => of(c).candidates[0]?.pct ?? null,
      partyOf: (c) => of(c).candidates[0]?.party ?? null,
    });
    for (const party of PARTIES) {
      if (!data.items.some((c) => partyVotes(of(c), party))) continue;
      const short = partyStyle(party).short;
      metrics.push(
        { ...base, key: `${election}.${party}.pct`, label: `${label}・${short}得票率`, unit: '%', kind: 'rate', field: `${party}.pct`, value: (c) => partyVotes(of(c), party)?.pct ?? null,
          national: { label: '全國', value: (items) => ratio(sumBy(items, (c) => partyVotes(of(c), party)?.votes ?? 0), sumBy(items, (c) => of(c).valid)) } },
        { ...base, key: `${election}.${party}.votes`, label: `${label}・${short}得票數`, unit: '票', kind: 'count', field: `${party}.votes`, value: (c) => partyVotes(of(c), party)?.votes ?? null },
      );
    }
    metrics.push(
      { ...base, key: `${election}.margin_pct`, label: `${label}・第一名領先幅度`, unit: '百分點', kind: 'rate', field: 'margin_pct', value: (c) => of(c).margin_pct },
      { ...base, key: `${election}.margin`, label: `${label}・第一名領先票數`, unit: '票', kind: 'count', field: 'margin', value: (c) => of(c).margin },
    );
    if (data.items.every((c) => of(c).turnout !== null)) {
      // 全國投票率＝各縣市投票數（投票率 × 選舉人數）加總 ÷ 選舉人數加總
      metrics.push({ ...base, key: `${election}.turnout`, label: `${label}・投票率`, unit: '%', kind: 'rate', field: 'turnout', value: (c) => of(c).turnout,
        national: { label: '全國', value: (items) => ratio(sumBy(items, (c) => ((of(c).turnout ?? 0) * (of(c).electorate ?? 0)) / 100), sumBy(items, (c) => of(c).electorate ?? 0)) } });
    }
  }
  const order = (m: Metric) => {
    const i = TOPICS.indexOf(m.category);
    return i === -1 ? TOPICS.length - 2.5 : i; // 不在清單的主題排在選舉前面
  };
  return metrics.sort((a, b) => order(a) - order(b));
}

export interface ComparePair {
  key: string;
  label: string;
  older: Metric & { election: CountyElectionKey };
  newer: Metric & { election: CountyElectionKey };
}

/** 前後兩次選舉的同一欄位配成一組（勝選版圖不是數值，不配） */
export function buildPairs(metrics: Metric[], data: CountiesResponse): ComparePair[] {
  const pairs: ComparePair[] = [];
  for (const newer of metrics) {
    if (newer.partyOf) continue;
    const prev = newer.election && PREVIOUS[newer.election];
    const older = prev ? metrics.find((m) => m.election === prev && m.field === newer.field) : undefined;
    if (!older?.election || !newer.election) continue;
    const from = data.elections[older.election].label;
    const to = data.elections[newer.election].label;
    pairs.push({
      key: newer.key,
      label: `${newer.label.replace(`${to}・`, '')}（${from} → ${to}）`,
      older: { ...older, election: older.election },
      newer: { ...newer, election: newer.election },
    });
  }
  return pairs;
}

export const valuesOf = (metric: Metric, items: CountyItem[]) =>
  items.map((c) => ({ county: c.county, v: metric.value(c) })).filter((r): r is { county: string; v: number } => r.v !== null);

/**
 * 把 `?county=` 解析成縣市資料列。查不到就回 null，不要靜默用第一筆
 * ——以前 `?county=山地原住民` 會顯示基隆市的資料，而且網址還騙人。
 */
export function resolveCounty<T extends { county: string }>(items: T[], wanted: string | null): T | null {
  if (!wanted) return null;
  return items.find((c) => c.county === wanted) ?? null;
}
