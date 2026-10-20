import { useMemo, useState } from 'react';
import { buildUrl } from '../api/client';
import type { CountiesResponse, CountyElection, CountyElectionKey, CountyItem, CountyStatsResponse, CouncilResponse } from '../api/types';
import { EmptyState, ErrorState, LoadingState } from '../components/DataStates';
import { useApi } from '../hooks/useApi';
import { useParam } from '../hooks/useParam';
import { ChoroplethMap } from '../components/ChoroplethMap';
import { LegislatorVotes } from '../components/LegislatorVotes';
import { SplitTicket } from '../components/SplitTicket';
import { Demographics } from '../components/Demographics';
import { PopulationTrend } from '../components/PopulationTrend';
import { TownMap } from '../components/TownMap';
import { VoteTrends } from '../components/VoteTrends';
import { CouncilSeats } from '../components/CouncilSeats';
import { CustomData } from '../components/CustomData';
import { CountyOverview } from '../components/CountyOverview';
import { PartyTag } from '../components/PartyTag';
import { mergeStats } from '../lib/customData';
import { COMPARE_NOTES, noteFor } from '../lib/metricNotes';
import { Tip, noteText } from '../components/Tip';
import { colorAt, type ScaleName } from '../lib/colorScales';
import { downloadCsv } from '../lib/csv';
import { partyStyle } from '../lib/parties';
import { NATIONAL } from '../components/CountyOptions';

export interface CountiesPageProps {
  refreshToken: number;
  /** 視角：「全國」或縣市名稱（header 的選單，全站共用） */
  scope: string;
  onScopeChange: (scope: string) => void;
  onOpenId?: (id: string) => void;
  onNavigate?: (href: string) => void;
}

/* ---------- 指標 ---------- */

// county-stats.json 的指標自帶單位（家、床、萬元／坪…），所以開放成字串
type Unit = '人' | '戶' | '%' | '票' | '百分點' | '平方公里' | '人／平方公里' | (string & {});

interface Metric {
  key: string;
  label: string;
  /** 縣市總覽卡片用：不含資料時點的短名稱與時點 */
  short?: string;
  period?: string;
  /** 頁首的類別按鈕（人口、選舉、醫療…）；選單只列目前類別的指標 */
  category: string;
  /** 次分類（人口結構、少子化、長照據點等，供下拉選單 optgroup 分組） */
  subcategory?: string;
  /** 數值類型：比率/率（rate）或總量/計數（count），供篩選切換 */
  kind?: 'rate' | 'count';
  unit: Unit;
  /** 非比率的小數位數（面積 2 位、密度 1 位）；比率固定 2 位 */
  digits?: number;
  value: (c: CountyItem) => number | null;
  /** 選舉指標：所屬選舉與欄位，用來配對前後兩次（時間差異） */
  election?: CountyElectionKey;
  field?: string;
  /**
   * 加總沒有意義的指標（例如人口密度）用這個取代「全國加總」那一格：
   * 22 個縣市密度的和沒有意義，全國要一起算（總人口 ÷ 總面積）。
   */
  national?: { value: (items: CountyItem[]) => number | null; label: string };
  /** 選舉第一名政黨版圖填色用 */
  partyOf?: (c: CountyItem) => string | null;
}

const ELECTIONS: CountyElectionKey[] = ['president_2024', 'president_2020', 'mayor_2022', 'mayor_2018'];
/** 時間差異：新 ← 舊 */
const PREVIOUS: Partial<Record<CountyElectionKey, CountyElectionKey>> = { president_2024: 'president_2020', mayor_2022: 'mayor_2018' };
const PARTIES = ['民主進步黨', '中國國民黨', '台灣民眾黨'];

const num = (n: number, digits = 0) => n.toLocaleString('zh-TW', { maximumFractionDigits: digits, minimumFractionDigits: digits });
/** 比率顯示：缺值（null）一律印破折號，不要印 NaN */
const numOrDash = (n: number | null, digits = 0) => (n === null || !Number.isFinite(n) ? '—' : num(n, digits));
// whole 為 0 或缺值時回 null（＝「無資料」），不要讓 NaN／Infinity 流進色階與表格：
// 這個檔案其他地方都用 `?? null` 表示缺值，比率也該一致。
const ratio = (part: number, whole: number) => (Number.isFinite(part) && Number.isFinite(whole) && whole !== 0 ? (part / whole) * 100 : null);
const sumBy = (items: CountyItem[], f: (c: CountyItem) => number) => items.reduce((t, c) => t + f(c), 0);
const isRate = (unit: Unit) => unit === '%' || unit === '百分點';
const fmt = (value: number | null, unit: Unit, digits = 0) =>
  value === null ? '—' : isRate(unit) ? `${num(value, 2)}${unit === '%' ? '%' : ' 個百分點'}` : `${num(value, digits)} ${unit}`;
/**
 * 人口密度（人/km²）：面積缺值或 0 時回 null（＝「無資料」）。
 * 理由同 ratio()：不要讓 Infinity／NaN 流進色階與排名。
 */
const perArea = (population: number, area: number | null | undefined) =>
  Number.isFinite(population) && Number.isFinite(area) && (area ?? 0) > 0 ? Math.round((population / (area as number)) * 10) / 10 : null;
export { perArea };
const signed = (value: number, digits = 0) => `${value > 0 ? '+' : ''}${num(value, digits)}`;

function partyVotes(e: CountyElection, party: string): { votes: number; pct: number } | null {
  const list = e.candidates.filter((c) => c.party === party);
  if (!list.length) return null;
  return { votes: list.reduce((s, c) => s + c.votes, 0), pct: list.reduce((s, c) => s + c.pct, 0) };
}

function inferKind(unit: Unit, key: string): 'rate' | 'count' {
  if (unit === '%' || unit === '百分點' || unit === '‰' || unit.includes('率') || unit.includes('比') || unit.includes('／') || key.includes('rate') || key.includes('ratio') || key.includes('pct') || key.includes('density') || key.includes('speed')) {
    return 'rate';
  }
  return 'count';
}

function inferSubcategory(m: { category: string; label: string; key: string }): string {
  if (m.category === '人口') {
    if (m.key === 'population' || m.key === 'households' || m.key === 'density' || m.key === 'area_km2') return '基本與密度';
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
  if (m.category === '教育') {
    if (m.label.includes('學齡兒童')) return '學童分佈';
    return '各級學校數';
  }
  if (m.category === '經濟') {
    if (m.label.includes('國保') || m.label.includes('國民年金')) return '國民年金';
    return '所得與就業環境';
  }
  return m.category;
}

/** 由資料列出所有可分析的數值指標（相當於 tw_statistic_map 的「數值欄位」）；匯出給 render smoke 驗指標清單 */
export function buildMetrics(data: CountiesResponse, stats?: CountyStatsResponse): Metric[] {
  const metrics: Metric[] = [
    { key: 'population', category: '人口', subcategory: '基本與密度', kind: 'count', label: '人口數', unit: '人', value: (c) => c.population },
    { key: 'households', category: '人口', subcategory: '基本與密度', kind: 'count', label: '戶數', unit: '戶', value: (c) => c.households },
    { key: 'voting_age', category: '人口', subcategory: '人口結構', kind: 'count', label: '選舉年齡人口（20 歲以上）', unit: '人', value: (c) => c.voting_age },
    { key: 'voting_age_ratio', category: '人口', subcategory: '人口結構', kind: 'rate', label: '選舉年齡人口比率', unit: '%', value: (c) => ratio(c.voting_age, c.population),
      national: { label: '全國', value: (items) => ratio(sumBy(items, (c) => c.voting_age), sumBy(items, (c) => c.population)) } },
    { key: 'elderly', category: '人口', subcategory: '高齡與扶養', kind: 'count', label: '老年人口（65 歲以上）', unit: '人', value: (c) => c.elderly },
    { key: 'elderly_ratio', category: '人口', subcategory: '高齡與扶養', kind: 'rate', label: '老年人口比率', unit: '%', value: (c) => ratio(c.elderly, c.population),
      national: { label: '全國', value: (items) => ratio(sumBy(items, (c) => c.elderly), sumBy(items, (c) => c.population)) } },
    { key: 'area_km2', category: '人口', subcategory: '基本與密度', kind: 'count', label: '面積', unit: '平方公里', digits: 2, value: (c) => c.area_km2 },
    {
      key: 'density',
      label: '人口密度',
      category: '人口',
      subcategory: '基本與密度',
      kind: 'rate',
      unit: '人／平方公里',
      value: (c) => perArea(c.population, c.area_km2),
      // 22 個縣市密度相加沒有意義：全國那一格改成「總人口 ÷ 總面積」
      national: {
        label: '全國（總人口 ÷ 總面積）',
        value: (items) => perArea(
          items.reduce((s, c) => s + c.population, 0),
          items.reduce((s, c) => s + c.area_km2, 0),
        ),
      },
    },
  ];
  for (const f of stats?.fields ?? []) {
    const category = f.key.startsWith('custom.') ? '自訂' : f.category ?? '其他';
    const kind = inferKind(f.unit, f.key);
    const subcategory = inferSubcategory({ category, label: f.label, key: f.key });
    metrics.push({
      key: f.key,
      label: `${f.label}（${f.period}）`,
      short: f.label,
      period: f.period,
      category,
      subcategory,
      kind,
      unit: f.unit,
      digits: f.digits,
      value: (c) => stats?.items[c.county]?.[f.key] ?? null,
      national: f.national === undefined ? undefined : { label: '全國', value: () => f.national ?? null },
    });
  }
  for (const election of ELECTIONS) {
    const label = data.elections[election].label;
    const category = '選舉';
    const of = (c: CountyItem) => c.elections[election];

    // 各縣市第一名勝選政黨版圖
    metrics.push({
      key: `${election}.winner`,
      label: `${label}・第一名勝選政黨版圖`,
      unit: '%',
      category,
      subcategory: label,
      kind: 'rate',
      election,
      field: 'winner',
      value: (c) => of(c).candidates[0]?.pct ?? null,
      partyOf: (c) => of(c).candidates[0]?.party ?? null,
    });

    for (const party of PARTIES) {
      if (!data.items.some((c) => partyVotes(of(c), party))) continue;
      const short = partyStyle(party).short;
      metrics.push(
        { key: `${election}.${party}.votes`, label: `${label}・${short}得票數`, unit: '票', category, subcategory: label, kind: 'count', election, field: `${party}.votes`, value: (c) => partyVotes(of(c), party)?.votes ?? null },
        { key: `${election}.${party}.pct`, label: `${label}・${short}得票率`, unit: '%', category, subcategory: label, kind: 'rate', election, field: `${party}.pct`, value: (c) => partyVotes(of(c), party)?.pct ?? null,
          national: { label: '全國', value: (items) => ratio(sumBy(items, (c) => partyVotes(of(c), party)?.votes ?? 0), sumBy(items, (c) => of(c).valid)) } },
      );
    }
    metrics.push(
      { key: `${election}.margin`, label: `${label}・第一名領先票數`, unit: '票', category, subcategory: label, kind: 'count', election, field: 'margin', value: (c) => of(c).margin },
      { key: `${election}.margin_pct`, label: `${label}・第一名領先幅度`, unit: '百分點', category, subcategory: label, kind: 'rate', election, field: 'margin_pct', value: (c) => of(c).margin_pct },
    );
    if (data.items.every((c) => of(c).turnout !== null)) {
      // 全國投票率＝各縣市投票數（投票率 × 選舉人數）加總 ÷ 選舉人數加總
      metrics.push({ key: `${election}.turnout`, label: `${label}・投票率`, unit: '%', category, subcategory: label, kind: 'rate', election, field: 'turnout', value: (c) => of(c).turnout,
        national: { label: '全國', value: (items) => ratio(sumBy(items, (c) => ((of(c).turnout ?? 0) * (of(c).electorate ?? 0)) / 100), sumBy(items, (c) => of(c).electorate ?? 0)) } });
    }
  }
  // 統計檔的類別排在選舉前面、自訂排最後
  const order = (m: Metric) => (m.category === '人口' ? 0 : m.category === '選舉' ? 2 : m.category === '自訂' ? 3 : 1);
  return metrics.sort((a, b) => order(a) - order(b));
}

interface ComparePair {
  key: string;
  label: string;
  older: Metric & { election: CountyElectionKey };
  newer: Metric & { election: CountyElectionKey };
}

/** 前後兩次選舉的同一欄位配成一組 */
function buildPairs(metrics: Metric[], data: CountiesResponse): ComparePair[] {
  const pairs: ComparePair[] = [];
  for (const newer of metrics) {
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

/* ---------- 網址狀態 ---------- */

type Tab = 'map' | 'overview' | 'towns' | 'trend' | 'legislators' | 'split' | 'demographics' | 'population' | 'dual' | 'compare' | 'ranking' | 'data';
const TABS: { key: Tab; label: string }[] = [
  { key: 'map', label: '互動地圖' },
  { key: 'overview', label: '縣市總覽' },
  { key: 'towns', label: '鄉鎮地圖' },
  { key: 'trend', label: '得票趨勢' },
  { key: 'legislators', label: '立委得票' },
  { key: 'split', label: '分裂投票' },
  { key: 'demographics', label: '人口與得票' },
  { key: 'population', label: '人口趨勢' },
  { key: 'dual', label: '雙指標對比' },
  { key: 'compare', label: '時間差異' },
  { key: 'ranking', label: '排行榜' },
  { key: 'data', label: '原始資料' },
];
/** 主題優先：共同的分頁（地圖、對比、排行、原始資料）＋各主題自己的分頁 */
const TOPICS = ['人口', '醫療', '教育', '房價', '經濟', '產業', '能源', '財政', '農業', '選舉', '自訂'];
const TOPIC_TABS: Record<string, Tab[]> = {
  人口: ['population', 'towns'],
  選舉: ['trend', 'legislators', 'split', 'demographics', 'compare', 'towns'],
};
const tabsFor = (topic: string): Tab[] => ['map', 'overview', ...(TOPIC_TABS[topic] ?? []), 'dual', 'ranking', 'data'];
const SCALES: { key: ScaleName; label: string }[] = [
  { key: 'YlOrRd', label: '紅色系' },
  { key: 'Blues', label: '藍色系' },
  { key: 'Greens', label: '綠色系' },
  { key: 'Hot', label: '熱力圖' },
];
const TOP_N = ['5', '10', '15', '全部'];

/**
 * 把 `?county=` 解析成縣市資料列。抽成純函式：一來可測，二來避免「查不到就靜默用第一筆」
 * ——以前 `?county=山地原住民`（原住民委員的 region）會顯示基隆市的資料，而且網址還騙人。
 */
export function resolveCounty<T extends { county: string }>(items: T[], wanted: string | null): T | null {
  if (!wanted) return null;
  return items.find((c) => c.county === wanted) ?? null;
}

/* ---------- 縣市詳情（選舉表） ---------- */

/** 一場選舉：各候選人得票、與前次同黨得票的增減、第一名與第二名的差距 */
function ElectionTable({ title, current, previous, previousLabel }: { title: string; current: CountyElection; previous: CountyElection; previousLabel: string }) {
  const [first, second] = current.candidates;
  return (
    <section className="county-election">
      <h3>{title}</h3>
      <p className="muted">
        {current.turnout !== null ? `投票率 ${num(current.turnout, 2)}%・` : ''}有效票 {num(current.valid)}
        {current.electorate !== null ? `・選舉人 ${num(current.electorate)}` : ''}
      </p>
      {second ? (
        <p className="county-margin">
          <b>{first.name}</b> 領先 <b>{second.name}</b> {num(current.margin ?? 0)} 票（{num(current.margin_pct ?? 0, 2)} 個百分點）
        </p>
      ) : null}
      <div className="table-scroll">
        <table className="county-table">
          <thead>
            <tr>
              <th scope="col">候選人</th>
              <th scope="col">政黨</th>
              <th scope="col" className="num">得票數</th>
              <th scope="col" className="num">得票率</th>
              <th scope="col" className="num">{previousLabel}同黨得票</th>
              <th scope="col" className="num">增減</th>
            </tr>
          </thead>
          <tbody>
            {current.candidates.map((c) => {
              const prev = c.party === '無黨籍' ? null : partyVotes(previous, c.party);
              return (
                <tr key={c.name}>
                  <td>{c.name}</td>
                  <td>
                    <PartyTag party={c.party} />
                  </td>
                  <td className="num">{num(c.votes)}</td>
                  <td className="num">{num(c.pct, 2)}%</td>
                  <td className="num">{prev === null ? '—' : num(prev.votes)}</td>
                  <td className="num">{prev === null ? '—' : signed(c.votes - prev.votes)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details className="county-previous">
        <summary>{previousLabel}完整結果</summary>
        <ul>
          {previous.candidates.map((c) => (
            <li key={c.name}>
              {c.name} <PartyTag party={c.party} /> {num(c.votes)} 票（{num(c.pct, 2)}%）
            </li>
          ))}
        </ul>
      </details>
    </section>
  );
}

/**
 * elections＝目前是「選舉」主題：才顯示議員席次、立委與選舉表（首頁預設是人口，不載入選舉的東西）；
 * 其他主題（醫療、房價…）改列該主題各指標在這個縣市的數值。
 */
function CountyDetail({ county, data, councilCounties, elections, topicMetrics, onShowTowns, onOpenId }: { county: CountyItem; data: CountiesResponse; councilCounties: string[]; elections: boolean; topicMetrics: Metric[]; onShowTowns: () => void; onOpenId?: (id: string) => void; onNavigate?: (href: string) => void }) {
  const e = data.elections;
  return (
    <section className="panel county-detail" aria-label={`${county.county}詳細資料`}>
      <div className="county-detail-head">
        <h2>{county.county}</h2>
        <button type="button" onClick={onShowTowns}>看鄉鎮市區地圖</button>
      </div>

      {elections ? (
        <>
          {/* 首長視角第一優先：縣市長大選得票與勝負 */}
          <ElectionTable
            title={`${e.mayor_2022.label}（${county.county === '嘉義市' ? '2022-12-18 延期選舉' : e.mayor_2022.date}）`}
            current={county.elections.mayor_2022}
            previous={county.elections.mayor_2018}
            previousLabel={e.mayor_2018.label}
          />
          {/* 總統大選在地版圖 */}
          <ElectionTable
            title={`${e.president_2024.label}（${e.president_2024.date}）`}
            current={county.elections.president_2024}
            previous={county.elections.president_2020}
            previousLabel={e.president_2020.label}
          />
          {/* 六都議會席次 */}
          {councilCounties.includes(county.county) ? <CouncilSeats county={county.county} /> : null}
          {/* 區域立委民意代表 */}
          <div className="county-legislators">
            <h3>區域立委</h3>
            {county.legislators.length ? (
              county.legislators.map((l) => (
                <span key={l.id} className="county-legislator">
                  {onOpenId ? (
                    <button type="button" className="name-button" onClick={() => onOpenId(l.id)}>
                      {l.name}
                    </button>
                  ) : (
                    <b>{l.name}</b>
                  )}
                  <PartyTag party={l.party} />
                  <small className="muted">{l.area_name}</small>
                </span>
              ))
            ) : (
              <span className="muted">尚無資料</span>
            )}
          </div>
        </>
      ) : null}

      <div className="stat-row">
        <div className="stat-tile">
          <b className="stat-value">{num(county.population)}</b>
          <span className="stat-label"><Tip text={noteText('population')}>人口數</Tip>（{num(county.households)} 戶）</span>
        </div>
        <div className="stat-tile">
          <b className="stat-value">{num(county.voting_age)}</b>
          <span className="stat-label"><Tip text={noteText('voting_age_ratio')}>選舉年齡人口</Tip>（20 歲以上，{numOrDash(ratio(county.voting_age, county.population), 2)}%）</span>
        </div>
        <div className="stat-tile">
          <b className="stat-value">{num(county.elderly)}</b>
          <span className="stat-label"><Tip text={noteText('elderly_ratio')}>老年人口</Tip>（65 歲以上，{numOrDash(ratio(county.elderly, county.population), 2)}%）</span>
        </div>
        <div className="stat-tile">
          <b className="stat-value">{numOrDash(perArea(county.population, county.area_km2))}</b>
          <span className="stat-label"><Tip text={noteText('density')}>人口密度</Tip>（人／平方公里；面積 {num(county.area_km2, 2)} 平方公里）</span>
        </div>
      </div>

      {!elections && topicMetrics.length ? (
        <table className="county-table">
          <tbody>
            {topicMetrics.map((m) => (
              <tr key={m.key}>
                <th scope="row"><Tip text={noteText(m.key)}>{m.label}</Tip></th>
                <td className="num">{fmt(m.value(county), m.unit, m.digits)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}
    </section>
  );
}

/* ---------- 數據總覽、排行榜 ---------- */

/**
 * 全國視角下互動地圖右側的面板：以前沒選縣市時會偷偷顯示臺北市，現在明講是全國，
 * 並列出最高、最低各 5 個縣市（點了切換視角）。
 */
function NationalDetail({ metric, items, format, onSelect }: { metric: Metric; items: CountyItem[]; format: (v: number | null) => string; onSelect: (county: string) => void }) {
  const rows = valuesOf(metric, items).sort((a, b) => b.v - a.v);
  const list = (title: string, part: { county: string; v: number }[]) => (
    <div className="national-extremes">
      <h3>{title}</h3>
      <ol className="overview-town-list">
        {part.map((r) => (
          <li key={r.county}>
            <button type="button" className="link-button" onClick={() => onSelect(r.county)}>{r.county}</button>
            <span className="muted">{format(r.v)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <section className="panel county-detail" aria-label="全國">
      <div className="county-detail-head">
        <h2>全國・{metric.short ?? metric.label}</h2>
      </div>
      <p className="muted">點地圖上的縣市，或從上方「視角」選縣市，可以看該縣市的明細。</p>
      {rows.length ? (
        <div className="national-extremes-grid">
          {list('最高 5 個縣市', rows.slice(0, 5))}
          {list('最低 5 個縣市', rows.slice(-5).reverse())}
        </div>
      ) : (
        <p className="muted">這個指標沒有資料。</p>
      )}
    </section>
  );
}
/** 時間差異：比較指標本身的說明＋差異、變化率怎麼算 */
function CompareNote({ metricKey }: { metricKey: string }) {
  const note = noteFor(metricKey);
  return (
    <p className="metric-note">
      {note ? (
        <>
          <b>指標</b>　{note.definition}；{note.meaning}
          <br />
        </>
      ) : null}
      <b>差異</b>　{COMPARE_NOTES.diff.definition}。{COMPARE_NOTES.diff.meaning}
      <br />
      <b>變化率</b>　{COMPARE_NOTES.rate.definition}。{COMPARE_NOTES.rate.meaning}
    </p>
  );
}

/** 指標的定義與白話意義（lib/metricNotes.ts）；沒有說明的指標（例如自訂資料）就不顯示 */
function MetricNote({ metricKey }: { metricKey: string }) {
  const note = noteFor(metricKey);
  if (!note) return null;
  return (
    <p className="metric-note">
      <b>定義</b>　{note.definition}
      <br />
      <b>意義</b>　{note.meaning}
    </p>
  );
}

function MetricSelect({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: { key: string; label: string; category?: string; subcategory?: string }[];
  value: string;
  onChange: (key: string) => void;
}) {
  const option = (m: { key: string; label: string }) => (
    <option key={m.key} value={m.key} title={noteText(m.key)}>
      {m.label}
    </option>
  );

  // 若同一 category 下有 subcategory，則優先用 subcategory 分組；否則若跨 category 則用 category 分組
  const distinctCats = [...new Set(options.map((m) => m.category).filter(Boolean))];
  const distinctSubcats = [...new Set(options.map((m) => m.subcategory).filter(Boolean))];
  const useSubgroups = distinctSubcats.length > 1;
  const useCatGroups = distinctCats.length > 1;

  return (
    <label className="stat-control">
      <span>{label}</span>
      <select value={value} onChange={(event) => onChange(event.target.value)}>
        {useSubgroups ? (
          distinctSubcats.map((g) => (
            <optgroup key={g} label={g!}>
              {options.filter((m) => m.subcategory === g).map(option)}
            </optgroup>
          ))
        ) : useCatGroups ? (
          distinctCats.map((g) => (
            <optgroup key={g} label={g!}>
              {options.filter((m) => m.category === g).map(option)}
            </optgroup>
          ))
        ) : (
          options.map(option)
        )}
      </select>
    </label>
  );
}

/**
 * 選舉指標連動控制組：
 * 以前是 32 項平鋪（4 場選舉 × 3 黨 × 票數/得票率 + 第一名/領先/投票率），非常難找；
 * 現在拆解為「場次 ▾」、「對象 ▾」、「型態（得票率／票數）▾」三連動。
 */
function ElectionMetricControls({
  data,
  currentKey,
  onChange,
}: {
  data: CountiesResponse;
  currentKey: string;
  onChange: (key: string) => void;
}) {
  // 解析目前指標 key：如 president_2024.民主進步黨.pct、president_2024.turnout、president_2024.margin_pct
  const parts = currentKey.split('.');
  const activeElection: CountyElectionKey =
    ELECTIONS.find((e) => parts[0] === e) ?? 'president_2024';

  let activeTarget = '民主進步黨';
  let activeMeasure: 'pct' | 'votes' = 'pct';

  if (parts.length >= 3) {
    activeTarget = parts[1];
    activeMeasure = parts[2] === 'votes' ? 'votes' : 'pct';
  } else if (parts[1]?.startsWith('margin')) {
    activeTarget = 'margin';
    activeMeasure = parts[1] === 'margin' ? 'votes' : 'pct';
  } else if (parts[1] === 'turnout') {
    activeTarget = 'turnout';
    activeMeasure = 'pct';
  } else if (parts[1] === 'winner') {
    activeTarget = 'winner';
    activeMeasure = 'pct';
  }

  const setParams = (nextElection: CountyElectionKey, nextTarget: string, nextMeasure: 'pct' | 'votes') => {
    if (nextTarget === 'winner') {
      onChange(`${nextElection}.winner`);
    } else if (nextTarget === 'turnout') {
      onChange(`${nextElection}.turnout`);
    } else if (nextTarget === 'margin') {
      onChange(nextMeasure === 'votes' ? `${nextElection}.margin` : `${nextElection}.margin_pct`);
    } else {
      onChange(`${nextElection}.${nextTarget}.${nextMeasure}`);
    }
  };

  return (
    <>
      <label className="stat-control">
        <span>選舉場次</span>
        <select
          value={activeElection}
          onChange={(e) => setParams(e.target.value as CountyElectionKey, activeTarget, activeMeasure)}
        >
          {ELECTIONS.map((el) => (
            <option key={el} value={el}>
              {data.elections[el]?.label ?? el}
            </option>
          ))}
        </select>
      </label>

      <label className="stat-control">
        <span>政黨／項目</span>
        <select
          value={activeTarget}
          onChange={(e) => setParams(activeElection, e.target.value, activeMeasure)}
        >
          <optgroup label="政治版圖">
            <option value="winner">第一名勝選政黨版圖</option>
          </optgroup>
          <optgroup label="主要政黨">
            {PARTIES.map((p) => (
              <option key={p} value={p}>
                {partyStyle(p).short}
              </option>
            ))}
          </optgroup>
          <optgroup label="勝負與投票">
            <option value="margin">第一名領先</option>
            <option value="turnout">投票率</option>
          </optgroup>
        </select>
      </label>

      {activeTarget !== 'turnout' && activeTarget !== 'winner' ? (
        <label className="stat-control">
          <span>數據形式</span>
          <select
            value={activeMeasure}
            onChange={(e) => setParams(activeElection, activeTarget, e.target.value as 'pct' | 'votes')}
          >
            <option value="pct">{activeTarget === 'margin' ? '領先幅度（百分點）' : '得票率（%）'}</option>
            <option value="votes">{activeTarget === 'margin' ? '領先票數（票）' : '得票數（票）'}</option>
          </select>
        </label>
      ) : null}
    </>
  );
}

const valuesOf = (metric: Metric, items: CountyItem[]) =>
  items.map((c) => ({ county: c.county, v: metric.value(c) })).filter((r): r is { county: string; v: number } => r.v !== null);

/** 數據總覽：主要指標的全國加總（人數、票數類）、縣市平均、最高、最低 */
function Overview({ metric, items }: { metric: Metric; items: CountyItem[] }) {
  const rows = valuesOf(metric, items).sort((a, b) => b.v - a.v);
  if (!rows.length) return null;
  const sum = rows.reduce((s, r) => s + r.v, 0);
  const tiles = [
    ...(isRate(metric.unit)
      ? []
      : [metric.national
          ? { value: fmt(metric.national.value(items), metric.unit, metric.digits), label: metric.national.label }
          : { value: fmt(sum, metric.unit, metric.digits), label: `全國加總（${rows.length} 縣市）` }]),
    { value: fmt(sum / rows.length, metric.unit, metric.digits), label: '縣市平均' },
    { value: fmt(rows[0].v, metric.unit, metric.digits), label: `最高：${rows[0].county}` },
    { value: fmt(rows[rows.length - 1].v, metric.unit, metric.digits), label: `最低：${rows[rows.length - 1].county}` },
  ];
  return (
    <div className="stat-row stat-overview" aria-label={`數據總覽：${metric.label}`}>
      {tiles.map((t) => (
        <div key={t.label} className="stat-tile">
          <b className="stat-value">{t.value}</b>
          <span className="stat-label">{t.label}</span>
        </div>
      ))}
    </div>
  );
}

function Ranking({ metric, items, top, onSelect }: { metric: Metric; items: CountyItem[]; top: string; onSelect: (county: string) => void }) {
  const rows = valuesOf(metric, items)
    .sort((a, b) => b.v - a.v)
    .slice(0, top === '全部' ? undefined : Number(top));
  const max = Math.max(...rows.map((r) => r.v)) || 1;
  const min = Math.min(...rows.map((r) => r.v));
  return (
    <ol className="stat-ranking" aria-label={`${metric.label} 排行`}>
      {rows.map((r, i) => (
        <li key={r.county}>
          <span className="muted">{i + 1}</span>
          <button type="button" className="link-button" onClick={() => onSelect(r.county)}>
            {r.county}
          </button>
          <span className="stat-bar" aria-hidden="true">
            <i style={{ width: `${Math.max(2, (r.v / max) * 100)}%`, background: colorAt('Viridis', max === min ? 1 : (r.v - min) / (max - min)) }} />
          </span>
          <span className="stat-bar-value">{fmt(r.v, metric.unit, metric.digits)}</span>
        </li>
      ))}
    </ol>
  );
}

/* ---------- 頁面 ---------- */

/**
 * 縣市統計地圖：依 tw_statistic_map（app.py）的功能重做——數據總覽、互動地圖（指標、配色）、
 * 雙指標對比、時間差異（變化率）、排行榜、原始資料與 CSV 匯出；點縣市可看選舉細節與區域立委。
 * 人口與選舉是靜態資料（scripts/build-county-stats.mjs），立委名單來自同步資料。
 */
export function CountiesPage({ refreshToken, scope, onScopeChange, onOpenId, onNavigate }: CountiesPageProps) {
  const res = useApi<CountiesResponse>(buildUrl('/counties'), { refreshToken });
  // 有建置議員頁的縣市（連到議員頁用）
  const [metricKey, setMetricKey] = useParam<string>('metric', 'population');
  // 「自訂」沒載入資料前沒有指標可推算主題，所以另外記在網址上；其他主題由目前的指標推算
  const [topicParam, setTopicParam] = useParam<string>('topic', '');
  const [metric2Key, setMetric2Key] = useParam<string>('metric2', 'elderly_ratio');
  const [pairKey, setPairKey] = useParam<string>('pair', 'president_2024.民主進步黨.votes');
  const [scale, setScale] = useParam<ScaleName>('scale', 'YlOrRd', SCALES.map((x) => x.key));
  const [top, setTop] = useParam<string>('top', '10', TOP_N);
  // 一進來是全國總覽
  const [tabParam, setTab] = useParam<Tab>('tab', 'overview', TABS.map((x) => x.key));
  const [kindFilter, setKindFilter] = useState<'all' | 'rate' | 'count'>('all');
  // 縣市狀態只有一份：header 的視角（scope）。點地圖、排行、總覽裡的縣市名稱都是切換視角
  const setSelected = onScopeChange;

  // 醫療、房價、農地：沒有這個檔就只是少幾個指標，不擋整頁
  const stats = useApi<CountyStatsResponse>(buildUrl('/county-stats'), { refreshToken });
  // 使用者手動載入的資料（CustomData），跟 county-stats.json 合併成同一份
  const [custom, setCustom] = useState<CountyStatsResponse[]>([]);
  const allStats = useMemo(() => mergeStats([stats.data, ...custom]), [stats.data, custom]);
  const statKeys = useMemo(() => new Set(allStats.fields.map((f) => f.key)), [allStats]);
  const metrics = useMemo(() => (res.data ? buildMetrics(res.data, allStats) : []), [res.data, allStats]);
  const isElection = metrics.find((m) => m.key === metricKey)?.category === '選舉';
  const council = useApi<Pick<CouncilResponse, 'counties'>>(isElection ? buildUrl('/council', { only: 'counties' }) : null, { refreshToken });
  const pairs = useMemo(() => (res.data ? buildPairs(metrics, res.data) : []), [metrics, res.data]);
  const countyByName = useMemo(() => new Map((res.data?.items ?? []).map((c) => [c.county, c])), [res.data]);

  if (res.phase === 'error') return <ErrorState title="無法取得縣市資料（/api/v1/counties）" error={res.error} onRetry={res.reload} />;
  // empty 相位仍然帶著 data（useApi 的四態契約），所以「!res.data」這條永遠攔不到空清單；
  // 以前 items 為空時會直接讀 items[0].county 而 TypeError → 整個 AppShell 被 ErrorBoundary 蓋掉。
  if (res.phase === 'loading' && !res.data) return <LoadingState label="載入縣市資料…" />;
  if (!res.data || !res.data.items.length) {
    return <EmptyState message="目前沒有縣市資料" hint="人口與選舉是靜態檔（scripts/build-county-stats.mjs），請確認伺服器上有產生。" />;
  }

  const data = res.data;
  const items = data.items;
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const topic = topicParam === '自訂' ? '自訂' : metric.category;
  const topicMetrics = metrics.filter((m) => m.category === topic);
  const tabs = TABS.filter((t) => tabsFor(topic).includes(t.key));
  // 換主題後原本的分頁可能不在這個主題裡（例如醫療沒有「得票趨勢」）：落回縣市總覽
  const tab = tabs.some((t) => t.key === tabParam) ? tabParam : 'overview';
  const chooseTopic = (c: string) => {
    setTopicParam(c === '自訂' ? '自訂' : '');
    const candidates = metrics.filter((m) => m.category === c);
    const matchingKind = kindFilter === 'all' ? candidates : candidates.filter((m) => m.kind === kindFilter);
    if (!matchingKind.length && candidates.length) setKindFilter('all');
    const first = matchingKind[0] ?? candidates[0];
    if (first) setMetricKey(first.key);
  };
  const metric2 = metrics.find((m) => m.key === metric2Key) ?? metrics[1];
  const pair = pairs.find((p) => p.key === pairKey) ?? pairs[0];
  // 查不到就明講，不要靜默換成第一個縣市（原住民／不分區的 region 不是縣市名，會走到這裡）
  // 全國視角：current 為 null，各分頁自己決定怎麼呈現全國（不再偷偷預設臺北市）
  const current = scope === NATIONAL ? null : resolveCounty(items, scope);
  if (scope !== NATIONAL && !current) {
    return (
      <EmptyState message={`找不到縣市「${scope}」`} hint="網址上的 ?county= 可能不是縣市名稱（不分區與原住民沒有縣市頁）。可以從上方「視角」重新選擇。" />
    );
  }
  const focus = current?.county ?? null;
  if (!pair && tab === 'compare') {
    return <EmptyState message="目前沒有可對比的兩場選舉" hint="需要同一類選舉至少兩屆的資料。" />;
  }
  const mapValues = (m: Metric) => new Map(items.map((c) => [c.county, m.value(c)]));
  const formatOf = (m: Metric) => (v: number | null) => fmt(v, m.unit, m.digits);

  // 時間差異：變化率 =（新 − 舊）÷ 舊
  const compareRows = pair
    ? items.map((c) => {
        const a = pair.older.value(c);
        const b = pair.newer.value(c);
        return { county: c.county, a, b, diff: a === null || b === null ? null : b - a, rate: a === null || b === null || a === 0 ? null : ((b - a) / a) * 100 };
      })
    : [];
  const rateFormat = (v: number | null) => (v === null ? '無可比較資料' : `${signed(v, 1)}%`);

  const exportCsv = () =>
    downloadCsv(`縣市統計_${data.population_month}.csv`, [
      ['縣市', ...metrics.map((m) => `${m.label}（${m.unit}）`)],
      ...items.map((c) => [
        c.county,
        ...metrics.map((m) => {
          const v = m.value(c);
          return v === null ? '' : isRate(m.unit) ? v.toFixed(2) : m.digits ? v.toFixed(m.digits) : v;
        }),
      ]),
    ]);
  // 原始資料：列目前主題的指標（選舉有三十幾個，只列前 6 個＋目前選的）
  const tableMetrics = topicMetrics.length <= 10 ? topicMetrics : [...new Set([...topicMetrics.slice(0, 6), metric])];

  return (
    <>
      <h1 className="sr-only">縣市統計地圖</h1>

      <nav className="topic-nav" aria-label="主題">
        {TOPICS.filter((c) => c === '自訂' || metrics.some((m) => m.category === c)).map((c) => (
          <button key={c} type="button" aria-pressed={topic === c} onClick={() => chooseTopic(c)}>
            {c}
          </button>
        ))}
      </nav>

      {topic === '自訂' ? (
        <CustomData
          counties={items.map((c) => c.county)}
          loaded={custom.reduce((n, s) => n + s.fields.length, 0)}
          onLoad={(s) => { setCustom((list) => [...list.filter((x) => x.fields[0]?.source !== s.fields[0].source), s]); setMetricKey(s.fields[0].key); }} // 同一個檔名再載一次＝取代
          onClear={() => { setCustom([]); setMetricKey('population'); }}
        />
      ) : null}
      {topic === '自訂' && !topicMetrics.length ? null : (
      <>
      {/* 分頁列固定緊接在主題下面：以前放在指標選單與全國方塊之後，切到「縣市總覽」時那一塊消失，分頁列會上下跳 */}
      <div className="segmented stat-tabs" role="group" aria-label="分析方式">
        {tabs.map((t) => (
          <button key={t.key} type="button" aria-pressed={tab === t.key} onClick={() => setTab(t.key)}>
            {t.label}
          </button>
        ))}
      </div>

      {/* 縣市總覽看的是挑過的跨主題指標：上面的指標選單與全國方塊不需要 */}
      {tab === 'overview' ? null : (
      <>
      <div className="stat-controls">
        {topic === '選舉' ? (
          <ElectionMetricControls data={data} currentKey={metric.key} onChange={setMetricKey} />
        ) : (
          <>
            <MetricSelect
              label="分析指標"
              options={
                kindFilter === 'all'
                  ? topicMetrics
                  : topicMetrics.filter((m) => m.kind === kindFilter || m.key === metric.key)
              }
              value={metric.key}
              onChange={setMetricKey}
            />
            {topicMetrics.some((m) => m.kind === 'rate') && topicMetrics.some((m) => m.kind === 'count') ? (
              <div className="segmented" role="group" aria-label="指標型態">
                <button
                  type="button"
                  aria-pressed={kindFilter === 'all'}
                  onClick={() => setKindFilter('all')}
                  title="顯示全部指標"
                >
                  全部
                </button>
                <button
                  type="button"
                  aria-pressed={kindFilter === 'rate'}
                  onClick={() => {
                    setKindFilter('rate');
                    if (metric.kind === 'count') {
                      const firstRate = topicMetrics.find((m) => m.kind === 'rate');
                      if (firstRate) setMetricKey(firstRate.key);
                    }
                  }}
                  title="優先檢視比率、每萬人等密度指標（更適合面量地圖比較）"
                >
                  比率／密度
                </button>
                <button
                  type="button"
                  aria-pressed={kindFilter === 'count'}
                  onClick={() => {
                    setKindFilter('count');
                    if (metric.kind === 'rate') {
                      const firstCount = topicMetrics.find((m) => m.kind === 'count');
                      if (firstCount) setMetricKey(firstCount.key);
                    }
                  }}
                  title="檢視人口數、戶數、學校數等絕對總量"
                >
                  總量數值
                </button>
              </div>
            ) : null}
          </>
        )}
        {/* 分頁專用的選單也放在這一列，不要散在分頁按鈕下面 */}
        {tab === 'dual' ? <MetricSelect label="第二個分析指標" options={metrics} value={metric2.key} onChange={setMetric2Key} /> : null}
        {tab === 'compare' && pair ? <MetricSelect label="比較指標（前次 → 最近一次）" options={pairs} value={pair.key} onChange={setPairKey} /> : null}
        <span className="muted">資料期：{data.population_month}</span>
      </div>
      {tab === 'compare' && pair ? <CompareNote metricKey={pair.newer.key} /> : <MetricNote metricKey={metric.key} />}
      <Overview metric={metric} items={items} />
      </>
      )}

      {tab === 'map' ? (
        <div className="county-layout">
          <section className="panel county-map-panel">
            {!metric.partyOf ? (
              <div className="segmented stat-scales" role="group" aria-label="地圖配色">
                {SCALES.map((s) => (
                  <button key={s.key} type="button" aria-pressed={scale === s.key} onClick={() => setScale(s.key)}>
                    {s.label}
                  </button>
                ))}
              </div>
            ) : null}
            <ChoroplethMap
              items={items}
              values={mapValues(metric)}
              scale={scale}
              format={formatOf(metric)}
              title={`${metric.label} - 地理分布圖`}
              selected={focus ?? undefined}
              onSelect={setSelected}
              colorOf={
                metric.partyOf
                  ? (county) => {
                      const c = countyByName.get(county);
                      const p = c && metric.partyOf ? metric.partyOf(c) : null;
                      return p ? partyStyle(p).color : null;
                    }
                  : undefined
              }
              legendItems={
                metric.partyOf
                  ? [
                      { label: '民進黨', color: partyStyle('民主進步黨').color },
                      { label: '國民黨', color: partyStyle('中國國民黨').color },
                      { label: '民眾黨', color: partyStyle('台灣民眾黨').color },
                      { label: '無黨籍', color: partyStyle('無黨籍').color },
                    ]
                  : undefined
              }
              formatCounty={
                metric.partyOf
                  ? (county) => {
                      const c = countyByName.get(county);
                      const cand = c && metric.election ? c.elections[metric.election].candidates[0] : null;
                      return cand ? `${county}：${cand.party}（${cand.name} ${cand.pct.toFixed(2)}%）` : `${county}：無資料`;
                    }
                  : undefined
              }
            />
          </section>
          {current ? (
          <CountyDetail county={current} data={data} councilCounties={council.data?.counties ?? []} elections={metric.category === '選舉'}
            // 人口的基本數字上面已有方塊，表格只列 county-stats.json 的人口結構（男女、學齡、出生死亡、新住民）
            topicMetrics={metric.category === '選舉' ? [] : metrics.filter((m) => m.category === metric.category && (m.category !== '人口' || statKeys.has(m.key)))}
            onShowTowns={() => {
              // 鄉鎮層級只有人口與選舉資料：其他主題切回人口
              if (topic !== '人口' && topic !== '選舉') chooseTopic('人口');
              setTab('towns');
              requestAnimationFrame(() => document.querySelector('.stat-tabs')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
            }}
            onOpenId={onOpenId} onNavigate={onNavigate} />
          ) : (
            <NationalDetail metric={metric} items={items} format={formatOf(metric)} onSelect={setSelected} />
          )}
        </div>
      ) : null}

      {tab === 'overview' ? (
        <CountyOverview
          area={scope}
          items={items}
          metrics={metrics}
          format={(m, v) => fmt(v, m.unit as Unit, (m as Metric).digits)}
          refreshToken={refreshToken}
          onSelectCounty={setSelected}
        />
      ) : null}

      {tab === 'trend' ? <VoteTrends data={data} selected={focus} onSelect={setSelected} /> : null}

      {tab === 'legislators' ? <LegislatorVotes refreshToken={refreshToken} county={focus} onOpenId={onOpenId} /> : null}

      {tab === 'towns' ? <TownMap refreshToken={refreshToken} counties={data} county={focus} onSelectCounty={setSelected} /> : null}

      {tab === 'population' ? <PopulationTrend refreshToken={refreshToken} counties={data} selected={focus} onSelect={setSelected} /> : null}

      {tab === 'demographics' ? <Demographics refreshToken={refreshToken} county={focus} /> : null}

      {tab === 'split' ? <SplitTicket refreshToken={refreshToken} county={focus} /> : null}

      {tab === 'dual' ? (
        <>
          <div className="stat-dual">
            <section className="panel">
              <ChoroplethMap items={items} values={mapValues(metric)} scale="Blues" format={formatOf(metric)} title={metric.label} selected={focus ?? undefined} onSelect={setSelected} />
            </section>
            <section className="panel">
              <ChoroplethMap items={items} values={mapValues(metric2)} scale="OrRd" format={formatOf(metric2)} title={metric2.label} selected={focus ?? undefined} onSelect={setSelected} />
            </section>
          </div>
        </>
      ) : null}

      {tab === 'compare' ? (
        <>
          <div className="county-layout">
            <section className="panel county-map-panel">
              <ChoroplethMap
                items={items}
                values={new Map(compareRows.map((r) => [r.county, r.rate]))}
                scale="RdYlGn"
                diverging
                format={rateFormat}
                title={`${pair.label} 變化率`}
                selected={focus ?? undefined}
                onSelect={setSelected}
              />
            </section>
            <section className="panel">
              <div className="table-scroll">
                <table className="county-table">
                  <thead>
                    <tr>
                      <th scope="col">縣市</th>
                      <th scope="col" className="num">{data.elections[pair.older.election].label}</th>
                      <th scope="col" className="num">{data.elections[pair.newer.election].label}</th>
                      <th scope="col" className="num"><Tip text={`定義：${COMPARE_NOTES.diff.definition}\n意義：${COMPARE_NOTES.diff.meaning}`}>差異</Tip></th>
                      <th scope="col" className="num"><Tip text={`定義：${COMPARE_NOTES.rate.definition}\n意義：${COMPARE_NOTES.rate.meaning}`}>變化率</Tip></th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...compareRows]
                      .sort((x, y) => (y.rate ?? -Infinity) - (x.rate ?? -Infinity))
                      .map((r) => (
                        <tr key={r.county} aria-current={r.county === focus ? 'true' : undefined}>
                          <td>
                            <button type="button" className="link-button" onClick={() => setSelected(r.county)}>
                              {r.county}
                            </button>
                          </td>
                          <td className="num">{fmt(r.a, pair.older.unit)}</td>
                          <td className="num">{fmt(r.b, pair.newer.unit)}</td>
                          <td className="num">{r.diff === null ? '—' : signed(r.diff, isRate(pair.newer.unit) ? 2 : 0)}</td>
                          <td className="num">{r.rate === null ? '—' : `${signed(r.rate, 1)}%`}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      ) : null}

      {tab === 'ranking' ? (
        <section className="panel">
          <div className="sectionhead">
            <h2>
              {metric.label}・{top === '全部' ? '全部縣市' : `前 ${top} 名`}
            </h2>
            <div className="segmented" role="group" aria-label="顯示名次數">
              {TOP_N.map((n) => (
                <button key={n} type="button" aria-pressed={top === n} onClick={() => setTop(n)}>
                  {n === '全部' ? '全部' : `前 ${n}`}
                </button>
              ))}
            </div>
          </div>
          <Ranking
            metric={metric}
            items={items}
            top={top}
            onSelect={(county) => {
              setSelected(county);
              setTab('map');
            }}
          />
        </section>
      ) : null}

      {tab === 'data' ? (
        <section className="panel">
          <div className="sectionhead">
            <h2>原始資料</h2>
            <button type="button" onClick={exportCsv}>
              匯出全部指標 CSV（{metrics.length} 欄）
            </button>
          </div>
          <div className="table-scroll">
            <table className="county-table">
              <thead>
                <tr>
                  <th scope="col">縣市</th>
                  {tableMetrics.map((m) => (
                    <th key={m.key} scope="col" className="num">
                      <Tip text={noteText(m.key)}>{m.label}</Tip>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {items.map((c) => (
                  <tr key={c.county}>
                    <td>{c.county}</td>
                    {tableMetrics.map((m) => (
                      <td key={m.key} className="num">
                        {fmt(m.value(c), m.unit, m.digits)}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}
      </>
      )}

      <p className="muted">
        資料來源：
        {data.sources.map((s, i) => (
          <span key={s.url}>
            {i ? '、' : ''}
            <a href={s.url} target="_blank" rel="noreferrer noopener">
              {s.label}
            </a>
          </span>
        ))}
        {[...new Map((stats.data?.fields ?? []).filter((f) => f.url).map((f) => [f.url, f])).values()].map((f) => (
          <span key={f.url}>
            、
            <a href={f.url} target="_blank" rel="noreferrer noopener">
              {f.source}（{f.period}）
            </a>
          </span>
        ))}
        。統計地圖的顏色代表數值；選舉表中的顏色代表黨籍。「前次同黨得票」以政黨對照，無黨籍不比較。
      </p>
    </>
  );
}
