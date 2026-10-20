import { buildUrl } from '../api/client';
import type { CountyItem, CountyTrendsResponse, DemographicsResponse, PopulationTrendResponse } from '../api/types';
import { useApi } from '../hooks/useApi';
import { partyStyle } from '../lib/parties';

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
  { title: '人口動態', keys: ['population', 'pop_growth_rate', 'net_migration_rate', 'births', 'death_rate', 'elderly_ratio', 'aging_speed', 'old_dependency', 'new_residents_per1000'] },
  { title: '少子化與教育', keys: ['birth_rate', 'age_preschool', 'age_primary', 'primary_outlook', 'young_dependency'] },
  { title: '醫療與長照', keys: ['beds_per10k', 'physicians_per10k', 'ltc_per1000_elderly', 'ltc_points'] },
  { title: '經濟與住居', keys: ['income', 'unemployment', 'house_price', 'price_to_income', 'house_deals_per10k'] },
  { title: '財政', keys: ['own_revenue_ratio', 'expenditure_per_capita', 'debt_per_capita'] },
];
/** 卡片 key → 趨勢線用哪一條歷年資料（每人負債沿用債務餘額的走勢） */
const TREND_OF: Record<string, string> = { income: 'income', unemployment: 'unemployment', debt_per_capita: 'debt', births: 'births', elderly_ratio: 'elderly_ratio', population: 'population' };
const RATE_UNIT = /%|‰|百分點|／|倍/;

type Series = { label: string; points: { period: string; value: number }[] };

export function CountyOverview({ county, items, metrics, format, refreshToken, onSelectCounty }: {
  county: CountyItem;
  items: CountyItem[];
  metrics: OverviewMetric[];
  format: (m: OverviewMetric, v: number | null) => string;
  refreshToken: number;
  onSelectCounty: (county: string) => void;
}) {
  const trends = useApi<CountyTrendsResponse>(buildUrl('/county-trends'), { refreshToken });
  const popTrend = useApi<PopulationTrendResponse>(buildUrl('/population-trend'), { refreshToken });
  const demo = useApi<DemographicsResponse>(buildUrl('/demographics'), { refreshToken });

  const seriesOf = (key: string): Series | null => {
    const src = TREND_OF[key];
    if (src === 'population' && popTrend.data) {
      const row = popTrend.data.counties.find((c) => c.county === county.county);
      if (!row) return null;
      // 各年 12 月
      const points = popTrend.data.months
        .map((m, i) => ({ period: m, value: row.monthly[i] }))
        .filter((p): p is { period: string; value: number } => p.period.endsWith('-12') && p.value !== null)
        .map((p) => ({ period: p.period.slice(0, 4), value: p.value }));
      return { label: '人口數（各年 12 月）', points };
    }
    const s = src ? trends.data?.series[src] : undefined;
    if (!s) return null;
    const points = s.points.map((p) => ({ period: p.period, value: p.values[county.county] })).filter((p): p is { period: string; value: number } => typeof p.value === 'number');
    return points.length > 1 ? { label: s.label, points } : null;
  };

  const card = (m: OverviewMetric) => {
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
    return (
      <div key={m.key} className="overview-card">
        <span className="overview-label">{m.short ?? m.label}</span>
        <b className="overview-value">{format(m, v)}</b>
        <span className="overview-meta">
          {rank ? <span className="overview-rank">全國第 {rank} 高／{ranked.length}</span> : <span className="muted">無資料</span>}
          {compare ? (
            <span className="muted">
              {compare.text}
              {compare.diff !== null && compare.diff !== 0 ? <span className={compare.diff > 0 ? 'overview-up' : 'overview-down'}>{compare.diff > 0 ? ' ▲' : ' ▼'}</span> : null}
            </span>
          ) : null}
        </span>
        {series ? <Sparkline series={series} /> : null}
        {m.period ? <small className="muted">{m.period}</small> : null}
      </div>
    );
  };

  const byKey = new Map(metrics.map((m) => [m.key, m]));
  const mayor = county.elections.mayor_2022;
  const president = county.elections.president_2024;
  const towns = demo.data?.towns.filter((t) => t.county === county.county) ?? [];
  const townTrend = new Map((popTrend.data?.towns ?? []).filter((t) => t.county === county.county).map((t) => [t.town, t]));
  const yearKeys = popTrend.data ? Object.keys(popTrend.data.towns[0]?.population ?? {}).sort() : [];
  const [fromYear, toYear] = [yearKeys.at(-2), yearKeys.at(-1)];
  const townChange = (town: string) => {
    const t = townTrend.get(town);
    return t && fromYear && toYear && t.population[fromYear] ? ((t.population[toYear] - t.population[fromYear]) / t.population[fromYear]) * 100 : null;
  };

  return (
    <section className="county-overview" aria-label={`${county.county}縣市總覽`}>
      <div className="stat-controls">
        <label className="stat-control">
          <span>縣市</span>
          <select value={county.county} onChange={(event) => onSelectCounty(event.target.value)}>
            {items.map((c) => (
              <option key={c.county} value={c.county}>
                {c.county}
              </option>
            ))}
          </select>
        </label>
        <span className="muted">排名一律由大到小（「第 1 高」不一定是好事，例如失業率）；▲▼ 是高於或低於比較基準。</span>
      </div>

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
          <div className="overview-card">
            <span className="overview-label">2022 縣市長當選</span>
            <b className="overview-value">{mayor.candidates[0]?.name ?? '—'}</b>
            <span className="overview-meta">
              <span style={{ color: partyStyle(mayor.candidates[0]?.party ?? '').color }}>{mayor.candidates[0]?.party}</span>
              <span className="muted">得票率 {mayor.candidates[0]?.pct.toFixed(2)}%，領先 {mayor.margin_pct?.toFixed(2)} 個百分點</span>
            </span>
          </div>
          {['mayor_2022.turnout', 'president_2024.turnout'].map((k) => byKey.get(k)).filter((m): m is OverviewMetric => !!m).map(card)}
          <div className="overview-card">
            <span className="overview-label">2024 總統在地第一名</span>
            <b className="overview-value">{president.candidates[0]?.name ?? '—'}</b>
            <span className="overview-meta">
              <span style={{ color: partyStyle(president.candidates[0]?.party ?? '').color }}>{president.candidates[0]?.party}</span>
              <span className="muted">得票率 {president.candidates[0]?.pct.toFixed(2)}%</span>
            </span>
          </div>
        </div>
      </section>

      <section className="panel overview-group">
        <h2>區內落差（{towns.length} 個鄉鎮市區）</h2>
        {towns.length ? (
          <div className="overview-grid overview-towns">
            <TownExtremes title="65 歲以上比率" unit="%" rows={towns.map((t) => ({ town: t.town, v: t.elderly_ratio }))} />
            <TownExtremes title={`人口增減率（${fromYear}→${toYear}）`} unit="%" signed rows={towns.map((t) => ({ town: t.town, v: townChange(t.town) }))} />
            <TownExtremes title="年齡中位數" unit="歲" rows={towns.map((t) => ({ town: t.town, v: t.median_age }))} />
            <TownExtremes title="0–14 歲比率" unit="%" rows={towns.map((t) => ({ town: t.town, v: t.child_ratio }))} />
          </div>
        ) : (
          <p className="muted">{demo.phase === 'loading' ? '載入鄉鎮資料…' : '沒有鄉鎮資料'}</p>
        )}
      </section>
    </section>
  );
}

function TownExtremes({ title, unit, rows, signed = false }: { title: string; unit: string; rows: { town: string; v: number | null }[]; signed?: boolean }) {
  const sorted = rows.filter((r): r is { town: string; v: number } => r.v !== null).sort((a, b) => b.v - a.v);
  if (!sorted.length) return null;
  const show = (r: { town: string; v: number }) => (
    <li key={r.town}>
      {r.town}<span className="muted">{signed && r.v > 0 ? '+' : ''}{r.v.toFixed(unit === '歲' ? 0 : 2)}{unit}</span>
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
