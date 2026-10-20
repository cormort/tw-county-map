import { buildUrl } from '../api/client';
import type { CountyItem, CountyTrendsResponse, DemographicsResponse, PopulationTrendResponse } from '../api/types';
import { useApi } from '../hooks/useApi';
import { COMPARE_NOTES, noteFor } from '../lib/metricNotes';
import { Tip, noteText } from './Tip';
import { partyStyle } from '../lib/parties';
import { CountyOptions } from './CountyOptions';

/** 縣市總覽要用到的指標欄位（CountiesPage 的 Metric 的子集，避免循環 import） */
export interface OverviewMetric {
  key: string;
  label: string;
  short?: string;
  period?: string;
  unit: string;
  value: (c: CountyItem) => number | null;
  national?: { value: (items: CountyItem[]) => number | null; label: string };
}

/**
 * 縣市首長視角的總覽：每張卡片＝數值、全國排名、與全國比較、近年趨勢線；最後是區內鄉鎮市區落差。
 * 分組與指標寫死在這裡（這一頁的重點就是「挑過的」指標，不是全部列出）。
 */
const GROUPS: { title: string; keys: string[] }[] = [
  { title: '人口動態', keys: ['population', 'pop_growth_rate', 'net_migration_rate', 'births', 'death_rate', 'elderly_ratio', 'aging_speed', 'old_dependency', 'new_residents_per1000', 'indigenous_ratio'] },
  { title: '少子化與教育', keys: ['birth_rate', 'age_preschool', 'age_primary', 'primary_outlook', 'young_dependency', 'schools_primary', 'pupils_per_primary_school', 'schools_college'] },
  { title: '醫療與長照', keys: ['beds_per10k', 'physicians_per10k', 'ltc_per1000_elderly', 'ltc_points', 'nhi_coverage'] },
  { title: '經濟與住居', keys: ['income', 'unemployment', 'house_price', 'price_to_income', 'house_deals_per10k'] },
  { title: '產業與就業', keys: ['companies_per1000', 'businesses_per1000', 'factories', 'factories_per10k', 'labor_insured_per1000', 'national_pension_ratio'] },
  { title: '能源', keys: ['elec_total', 'elec_per_capita', 'elec_residential_per_capita', 'elec_industry_share', 'elec_growth'] },
  { title: '財政', keys: ['own_revenue_ratio', 'expenditure_per_capita', 'debt_per_capita'] },
];
/** 卡片 key → 趨勢線用哪一條歷年資料（每人負債沿用債務餘額的走勢） */
const TREND_OF: Record<string, string> = { income: 'income', unemployment: 'unemployment', debt_per_capita: 'debt', births: 'births', elderly_ratio: 'elderly_ratio', population: 'population', elec_total: 'electricity' };
const RATE_UNIT = /%|‰|百分點|／|倍/;

type Series = { label: string; points: { period: string; value: number }[] };

/** 趨勢序列裡可以直接把縣市加總成全國的（其他的用腳本存的官方全國值） */
const SUMMABLE = new Set(['births', 'debt', 'electricity']);

export function CountyOverview({ area, items, metrics, format, refreshToken, onSelectCounty }: {
  /** 「全國」或縣市名稱 */
  area: string;
  items: CountyItem[];
  metrics: OverviewMetric[];
  format: (m: OverviewMetric, v: number | null) => string;
  refreshToken: number;
  onSelectCounty: (county: string) => void;
}) {
  const trends = useApi<CountyTrendsResponse>(buildUrl('/county-trends'), { refreshToken });
  const popTrend = useApi<PopulationTrendResponse>(buildUrl('/population-trend'), { refreshToken });
  const demo = useApi<DemographicsResponse>(buildUrl('/demographics'), { refreshToken });
  const county = items.find((c) => c.county === area) ?? null; // null＝全國

  const seriesOf = (key: string): Series | null => {
    const src = TREND_OF[key];
    if (src === 'population' && popTrend.data) {
      const rows = popTrend.data.counties.filter((c) => !county || c.county === county.county);
      if (!rows.length) return null;
      // 各年 12 月；全國＝各縣市加總
      const points = popTrend.data.months
        .map((m, i) => ({ period: m, value: rows.some((r) => r.monthly[i] === null) ? null : rows.reduce((s, r) => s + (r.monthly[i] ?? 0), 0) }))
        .filter((p): p is { period: string; value: number } => p.period.endsWith('-12') && p.value !== null)
        .map((p) => ({ period: p.period.slice(0, 4), value: p.value }));
      return { label: '人口數（各年 12 月）', points };
    }
    const s = src ? trends.data?.series[src] : undefined;
    if (!s) return null;
    const valueAt = (p: (typeof s.points)[number]) =>
      county ? p.values[county.county] : p.national ?? (SUMMABLE.has(src) ? Object.values(p.values).reduce<number>((t, v) => t + (v ?? 0), 0) : null);
    const points = s.points.map((p) => ({ period: p.period, value: valueAt(p) })).filter((p): p is { period: string; value: number } => typeof p.value === 'number');
    return points.length > 1 ? { label: s.label, points } : null;
  };

  // 全國值：有官方全國值用它；人數、金額這類「量」用加總；比率沒有全國值時退回縣市平均（標出來）
  const nationalOf = (m: OverviewMetric): { v: number | null; avg: boolean } => {
    if (m.national) return { v: m.national.value(items), avg: false };
    const vs = items.map((c) => m.value(c)).filter((x): x is number => x !== null);
    if (!vs.length) return { v: null, avg: false };
    return RATE_UNIT.test(m.unit) ? { v: vs.reduce((s, x) => s + x, 0) / vs.length, avg: true } : { v: vs.reduce((s, x) => s + x, 0), avg: false };
  };

  /** 全國模式的卡片：全國值＋最高、最低的縣市 */
  const nationalCard = (m: OverviewMetric) => {
    const nat = nationalOf(m);
    const rows = items.map((c) => ({ county: c.county, v: m.value(c) })).filter((r): r is { county: string; v: number } => r.v !== null).sort((a, b) => b.v - a.v);
    const series = seriesOf(m.key);
    const note = noteFor(m.key);
    return (
      <div key={m.key} className="overview-card">
        <span className="overview-label"><Tip text={noteText(m.key)}>{m.short ?? m.label}</Tip></span>
        <b className="overview-value">{format(m, nat.v)}{nat.avg ? <small className="muted">（縣市平均）</small> : null}</b>
        {rows.length ? (
          <span className="overview-meta">
            <span>最高　<button type="button" className="link-button" onClick={() => onSelectCounty(rows[0].county)}>{rows[0].county}</button> {format(m, rows[0].v)}</span>
            <span>最低　<button type="button" className="link-button" onClick={() => onSelectCounty(rows.at(-1)!.county)}>{rows.at(-1)!.county}</button> {format(m, rows.at(-1)!.v)}</span>
          </span>
        ) : null}
        {series ? <Sparkline series={series} /> : null}
        {m.period ? <small className="muted">{m.period}</small> : null}
        {note ? (
          <details className="overview-note">
            <summary>這是什麼？</summary>
            <p><b>定義</b>　{note.definition}</p>
            <p><b>意義</b>　{note.meaning}</p>
          </details>
        ) : null}
      </div>
    );
  };

  const card = (m: OverviewMetric) => {
    if (!county) return nationalCard(m);
    const v = m.value(county);
    const ranked = items.map((c) => m.value(c)).filter((x): x is number => x !== null).sort((a, b) => b - a);
    const rank = v === null ? null : ranked.indexOf(v) + 1;
    // 比較基準：有全國值用全國值；比率類用縣市平均；人數、金額這種「量」改說占全國幾 %
    const nationalValue = m.national?.value(items) ?? (RATE_UNIT.test(m.unit) ? ranked.reduce((s, x) => s + x, 0) / ranked.length : null);
    const totalSum = ranked.reduce((s, x) => s + x, 0);
    const compare = v === null
      ? null
      : nationalValue !== null
        ? { text: `${m.national ? '全國' : '縣市平均'} ${format(m, nationalValue)}`, diff: v - nationalValue }
        : { text: `占全國 ${((v / totalSum) * 100).toFixed(1)}%`, diff: null };
    const series = seriesOf(m.key);
    const note = noteFor(m.key);
    return (
      <div key={m.key} className="overview-card">
        <span className="overview-label"><Tip text={noteText(m.key)}>{m.short ?? m.label}</Tip></span>
        <b className="overview-value">{format(m, v)}</b>
        <span className="overview-meta">
          {rank ? <span className="overview-rank"><Tip text={`${COMPARE_NOTES.rank.definition}。${COMPARE_NOTES.rank.meaning}`}>全國第 {rank} 高／{ranked.length}</Tip></span> : <span className="muted">無資料</span>}
          {compare ? (
            <span className="muted">
              <Tip text={`${COMPARE_NOTES.vsNational.definition}。${COMPARE_NOTES.vsNational.meaning}`}>{compare.text}</Tip>
              {compare.diff !== null && compare.diff !== 0 ? <span className={compare.diff > 0 ? 'overview-up' : 'overview-down'}>{compare.diff > 0 ? ' ▲' : ' ▼'}</span> : null}
            </span>
          ) : null}
        </span>
        {series ? <Sparkline series={series} /> : null}
        {m.period ? <small className="muted">{m.period}</small> : null}
        {note ? (
          <details className="overview-note">
            <summary>這是什麼？</summary>
            <p><b>定義</b>　{note.definition}</p>
            <p><b>意義</b>　{note.meaning}</p>
          </details>
        ) : null}
      </div>
    );
  };

  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const towns = county ? demo.data?.towns.filter((t) => t.county === county.county) ?? [] : [];
  const townTrend = new Map((popTrend.data?.towns ?? []).filter((t) => t.county === county?.county).map((t) => [t.town, t]));
  // 全國的 2024 總統得票：各縣市同一候選人加總
  const presidentNational = (() => {
    const votes = new Map<string, { name: string; party: string; votes: number }>();
    let valid = 0;
    for (const c of items) {
      const e = c.elections.president_2024;
      valid += e.valid;
      for (const x of e.candidates) votes.set(x.name, { name: x.name, party: x.party, votes: (votes.get(x.name)?.votes ?? 0) + x.votes });
    }
    return [...votes.values()].sort((a, b) => b.votes - a.votes).map((x) => ({ ...x, pct: (x.votes / valid) * 100 }));
  })();
  // 2022 縣市長：各黨當選席次
  const mayorSeats = [...items.reduce((m, c) => {
    const p = c.elections.mayor_2022.candidates[0]?.party ?? '—';
    return m.set(p, (m.get(p) ?? 0) + 1);
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);
  const yearKeys = popTrend.data ? Object.keys(popTrend.data.towns[0]?.population ?? {}).sort() : [];
  const [fromYear, toYear] = [yearKeys.at(-2), yearKeys.at(-1)];
  const townChange = (town: string) => {
    const t = townTrend.get(town);
    return t && fromYear && toYear && t.population[fromYear] ? ((t.population[toYear] - t.population[fromYear]) / t.population[fromYear]) * 100 : null;
  };

  return (
    <section className="county-overview" aria-label={`${area}總覽`}>
      <div className="stat-controls">
        <label className="stat-control">
          <span>範圍</span>
          <select value={county ? county.county : '全國'} onChange={(event) => onSelectCounty(event.target.value)}>
            <option value="全國">全國</option>
            <CountyOptions counties={items.map((c) => c.county)} />
          </select>
        </label>
      </div>
      <details className="metric-note overview-howto">
        <summary>怎麼看這些卡片？</summary>
        {county ? (
          <>
            <p><b>全國第幾高</b>　{COMPARE_NOTES.rank.definition}。{COMPARE_NOTES.rank.meaning}</p>
            <p><b>跟全國比</b>　{COMPARE_NOTES.vsNational.definition}。{COMPARE_NOTES.vsNational.meaning}</p>
          </>
        ) : (
          <p><b>全國值</b>　比率用官方的全國值（沒有時用 22 縣市平均，會標出來）；人數、金額是縣市加總。下面列出最高與最低的縣市，點縣市名稱可以切到該縣市的總覽。</p>
        )}
        <p><b>趨勢線</b>　近幾年同一個指標的走勢，滑過可以看每年的數字；只畫形狀，不同卡片之間的高低不能直接比。</p>
        <p><b>這是什麼？</b>　展開可以看每個指標怎麼算、代表什麼意思。</p>
      </details>

      {GROUPS.map((g) => {
        const list = g.keys.map((k) => byKey.get(k)).filter((m): m is OverviewMetric => !!m);
        return list.length ? (
          <section key={g.title} className="panel overview-group">
            <h2>{g.title}</h2>
            <div className="overview-grid">{list.map(card)}</div>
          </section>
        ) : null;
      })}

      <section className="panel overview-group">
        <h2>治理與民意</h2>
        <div className="overview-grid">
          {county ? (
            <div className="overview-card">
              <span className="overview-label">2022 縣市長當選</span>
              <b className="overview-value">{county.elections.mayor_2022.candidates[0]?.name ?? '—'}</b>
              <span className="overview-meta">
                <span style={{ color: partyStyle(county.elections.mayor_2022.candidates[0]?.party ?? '').color }}>{county.elections.mayor_2022.candidates[0]?.party}</span>
                <span className="muted">得票率 {county.elections.mayor_2022.candidates[0]?.pct.toFixed(2)}%，領先 {county.elections.mayor_2022.margin_pct?.toFixed(2)} 個百分點</span>
              </span>
            </div>
          ) : (
            <div className="overview-card">
              <span className="overview-label">2022 縣市長當選席次</span>
              <ol className="overview-town-list">
                {mayorSeats.map(([party, n]) => (
                  <li key={party}><span style={{ color: partyStyle(party).color }}>{party}</span><span className="muted">{n} 席</span></li>
                ))}
              </ol>
            </div>
          )}
          {['mayor_2022.turnout', 'president_2024.turnout'].map((k) => byKey.get(k)).filter((m): m is OverviewMetric => !!m).map(card)}
          {county ? (
            <div className="overview-card">
              <span className="overview-label">2024 總統在地第一名</span>
              <b className="overview-value">{county.elections.president_2024.candidates[0]?.name ?? '—'}</b>
              <span className="overview-meta">
                <span style={{ color: partyStyle(county.elections.president_2024.candidates[0]?.party ?? '').color }}>{county.elections.president_2024.candidates[0]?.party}</span>
                <span className="muted">得票率 {county.elections.president_2024.candidates[0]?.pct.toFixed(2)}%</span>
              </span>
            </div>
          ) : (
            <div className="overview-card">
              <span className="overview-label">2024 總統全國得票</span>
              <ol className="overview-town-list">
                {presidentNational.map((x) => (
                  <li key={x.name}><span style={{ color: partyStyle(x.party).color }}>{x.name}</span><span className="muted">{x.pct.toFixed(2)}%（{x.votes.toLocaleString('zh-TW')} 票）</span></li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </section>

      {county ? (
        <section className="panel overview-group">
          <h2>區內落差（{towns.length} 個鄉鎮市區）</h2>
          {towns.length ? (
            <div className="overview-grid overview-towns">
              <Extremes title="65 歲以上比率" format={pct} rows={towns.map((t) => ({ name: t.town, v: t.elderly_ratio }))} />
              <Extremes title={`人口增減率（${fromYear}→${toYear}）`} format={signedPct} rows={towns.map((t) => ({ name: t.town, v: townChange(t.town) }))} />
              <Extremes title="年齡中位數" format={(v) => `${v.toFixed(0)}歲`} rows={towns.map((t) => ({ name: t.town, v: t.median_age }))} />
              <Extremes title="0–14 歲比率" format={pct} rows={towns.map((t) => ({ name: t.town, v: t.child_ratio }))} />
            </div>
          ) : (
            <p className="muted">{demo.phase === 'loading' ? '載入鄉鎮資料…' : '沒有鄉鎮資料'}</p>
          )}
        </section>
      ) : (
        <section className="panel overview-group">
          <h2>縣市間落差</h2>
          <div className="overview-grid overview-towns">
            {['elderly_ratio', 'pop_growth_rate', 'birth_rate', 'income', 'unemployment', 'own_revenue_ratio']
              .map((k) => byKey.get(k))
              .filter((m): m is OverviewMetric => !!m)
              .map((m) => (
                <Extremes key={m.key} title={m.short ?? m.label} format={(v) => format(m, v)} onSelect={onSelectCounty}
                  rows={items.map((c) => ({ name: c.county, v: m.value(c) }))} />
              ))}
          </div>
        </section>
      )}
    </section>
  );
}

const pct = (v: number) => `${v.toFixed(2)}%`;
const signedPct = (v: number) => `${v > 0 ? '+' : ''}${v.toFixed(2)}%`;

/** 最高、最低各 3 個（鄉鎮或縣市）；onSelect 有給時名稱可以點 */
function Extremes({ title, rows, format, onSelect }: { title: string; rows: { name: string; v: number | null }[]; format: (v: number) => string; onSelect?: (name: string) => void }) {
  const sorted = rows.filter((r): r is { name: string; v: number } => r.v !== null).sort((a, b) => b.v - a.v);
  if (!sorted.length) return null;
  const show = (r: { name: string; v: number }) => (
    <li key={r.name}>
      {onSelect ? <button type="button" className="link-button" onClick={() => onSelect(r.name)}>{r.name}</button> : r.name}
      <span className="muted">{format(r.v)}</span>
    </li>
  );
  return (
    <div className="overview-card">
      <span className="overview-label">{title}</span>
      <span className="muted">最高</span>
      <ol className="overview-town-list">{sorted.slice(0, 3).map(show)}</ol>
      <span className="muted">最低</span>
      <ol className="overview-town-list">{sorted.slice(-3).reverse().map(show)}</ol>
    </div>
  );
}

/** 近年走勢：純 SVG 折線，標頭尾年份 */
function Sparkline({ series }: { series: Series }) {
  const vs = series.points.map((p) => p.value);
  const [min, max] = [Math.min(...vs), Math.max(...vs)];
  const pts = vs.map((v, i) => `${((i / (vs.length - 1)) * 100).toFixed(1)},${(26 - ((v - min) / (max - min || 1)) * 22).toFixed(1)}`).join(' ');
  const first = series.points[0];
  const last = series.points.at(-1)!;
  return (
    <span className="overview-trend" title={`${series.label}：${series.points.map((p) => `${p.period} ${p.value.toLocaleString('zh-TW')}`).join('、')}`}>
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={pts} />
      </svg>
      <small className="muted">{first.period}–{last.period}</small>
    </span>
  );
}
