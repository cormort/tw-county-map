import { useMemo, useState } from 'react';
import { Printer } from 'lucide-react';
import { buildUrl } from '../api/client';
import type { CountyItem, CountyTrendsResponse, DemographicsResponse, PopulationTrendResponse } from '../api/types';
import { REGIONS, SIX_METROS } from '../components/CountyOptions';
import { Tip, noteText } from '../components/Tip';
import { useApi } from '../hooks/useApi';
import { num, RATE_UNIT } from '../lib/format';
import { formatMetric, valuesOf, type Metric } from '../lib/metrics';
import { COMPARE_NOTES, noteFor, polarityOf } from '../lib/metricNotes';
import { partyStyle } from '../lib/parties';
import { SubTabs, type ViewContext } from './shared';

/**
 * 總覽：每張卡片＝數值、排名、與比較基準的差、近年趨勢線；縣市視角另有強弱項成績單與區內鄉鎮落差。
 * 分組與指標寫死在這裡（這一頁的重點就是「挑過的」指標，不是全部列出）。
 */
const GROUPS: { id: string; title: string; keys: string[] }[] = [
  { id: 'pop', title: '人口動態', keys: ['population', 'pop_growth_rate', 'net_migration_rate', 'births', 'death_rate', 'elderly_ratio', 'aging_speed', 'old_dependency', 'new_residents_per1000', 'indigenous_ratio'] },
  { id: 'edu', title: '少子化與教育', keys: ['birth_rate', 'age_preschool', 'age_primary', 'primary_outlook', 'young_dependency', 'schools_primary', 'pupils_per_primary_school', 'schools_college'] },
  { id: 'health', title: '醫療與長照', keys: ['beds_per10k', 'physicians_per10k', 'ltc_per1000_elderly', 'ltc_points', 'nhi_coverage'] },
  { id: 'econ', title: '經濟與住居', keys: ['income', 'unemployment', 'house_price', 'price_to_income', 'house_deals_per10k'] },
  { id: 'industry', title: '產業與就業', keys: ['companies_per1000', 'businesses_per1000', 'factories', 'factories_per10k', 'labor_insured_per1000', 'national_pension_ratio'] },
  { id: 'energy', title: '能源', keys: ['elec_total', 'elec_per_capita', 'elec_residential_per_capita', 'elec_industry_share', 'elec_growth'] },
  { id: 'finance', title: '財政', keys: ['own_revenue_ratio', 'expenditure_per_capita', 'debt_per_capita'] },
];
/** 卡片 key → 趨勢線用哪一條歷年資料（每人負債沿用債務餘額的走勢） */
const TREND_OF: Record<string, string> = { income: 'income', unemployment: 'unemployment', debt_per_capita: 'debt', births: 'births', elderly_ratio: 'elderly_ratio', population: 'population', elec_total: 'electricity' };
/** 趨勢序列裡可以直接把縣市加總成全國的（其他的用腳本存的官方全國值） */
const SUMMABLE = new Set(['births', 'debt', 'electricity']);

type Series = { label: string; points: { period: string; value: number }[] };
type Benchmark = 'national' | 'tier' | 'region';

const isRateMetric = (m: Metric) => m.kind === 'rate' || RATE_UNIT.test(m.unit);
/** 差距的文字：比率的差是「百分點」，不是 % */
const diffText = (m: Metric, d: number) => (m.unit === '%' ? `${num(Math.abs(d), 2)} 個百分點` : formatMetric(m, Math.abs(d)));

export function OverviewView({ data, metrics, current: county, onSelect, scope }: ViewContext) {
  const items = data.items;
  const trends = useApi<CountyTrendsResponse>(buildUrl('/county-trends'));
  const popTrend = useApi<PopulationTrendResponse>(buildUrl('/population-trend'));
  const demo = useApi<DemographicsResponse>(buildUrl('/demographics'));
  const [benchmark, setBenchmark] = useState<Benchmark>('national');
  const byKey = useMemo(() => new Map(metrics.map((m) => [m.key, m])), [metrics]);

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
  const nationalOf = (m: Metric): { v: number | null; avg: boolean } => {
    if (m.national) return { v: m.national.value(items), avg: false };
    const vs = valuesOf(m, items).map((r) => r.v);
    if (!vs.length) return { v: null, avg: false };
    const sum = vs.reduce((s, x) => s + x, 0);
    return isRateMetric(m) ? { v: sum / vs.length, avg: true } : { v: sum, avg: false };
  };

  // 比較基準：全國、同級（六都／非六都）、同區域
  const peers = useMemo((): CountyItem[] => {
    if (!county || benchmark === 'national') return items;
    if (benchmark === 'tier') {
      const metro = SIX_METROS.includes(county.county);
      return items.filter((c) => SIX_METROS.includes(c.county) === metro);
    }
    const r = REGIONS.find((reg) => reg.counties.includes(county.county));
    return r ? items.filter((c) => r.counties.includes(c.county)) : items;
  }, [county, benchmark, items]);
  const region = county ? REGIONS.find((r) => r.counties.includes(county.county))?.name ?? '同區域' : '';
  const tierLabel = county && SIX_METROS.includes(county.county) ? '六都' : '非六都';
  const benchmarkLabel = benchmark === 'tier' ? tierLabel : benchmark === 'region' ? region : '全國';

  /**
   * 強弱項成績單：只看「比率」類指標。人數、處數這類總量只反映縣市大小
   * （以前臺中的「優勢」會列出出生數、長照據點數，其實只是人多），不能當成施政表現。
   */
  const scorecard = useMemo(() => {
    if (!county) return null;
    const scored: { metric: Metric; rank: number; total: number; strength: boolean; better: 'higher' | 'lower'; diff: number; value: number; score: number }[] = [];
    for (const g of GROUPS) {
      for (const k of g.keys) {
        const m = byKey.get(k);
        if (!m || !isRateMetric(m)) continue;
        const pol = polarityOf(m.key);
        if (pol === 'neutral') continue;
        const v = m.value(county);
        if (v === null) continue;
        const all = valuesOf(m, items).map((r) => r.v);
        const total = all.length;
        if (total < 5) continue;
        const highRank = all.filter((x) => x > v).length + 1; // 1＝數值最高（並列同名次）
        const lowRank = all.filter((x) => x < v).length + 1; // 1＝數值最低
        const base = m.national?.value(items) ?? all.reduce((s, x) => s + x, 0) / total;
        const bestRank = pol === 'higher_better' ? highRank : lowRank;
        const worstRank = pol === 'higher_better' ? lowRank : highRank;
        const threshold = Math.max(1, Math.floor(total * 0.35));
        const better = pol === 'higher_better' ? 'higher' : 'lower';
        if (bestRank <= threshold) scored.push({ metric: m, rank: bestRank, total, strength: true, better, diff: v - base, value: v, score: bestRank / total });
        else if (worstRank <= threshold) scored.push({ metric: m, rank: worstRank, total, strength: false, better, diff: v - base, value: v, score: worstRank / total });
      }
    }
    const pick = (strength: boolean) => scored.filter((s) => s.strength === strength).sort((a, b) => a.score - b.score).slice(0, 5);
    return { strengths: pick(true), weaknesses: pick(false) };
  }, [county, items, byKey]);

  const card = (m: Metric) => {
    const series = seriesOf(m.key);
    const note = noteFor(m.key);
    const extra = (
      <>
        {series ? <Sparkline series={series} /> : null}
        {m.period ? <small className="muted">{m.period}</small> : null}
        {note ? (
          <details className="overview-note">
            <summary>這是什麼？</summary>
            <p><b>定義</b>　{note.definition}</p>
            <p><b>意義</b>　{note.meaning}</p>
          </details>
        ) : null}
      </>
    );
    if (!county) {
      const nat = nationalOf(m);
      const rows = valuesOf(m, items).sort((a, b) => b.v - a.v);
      return (
        <div key={m.key} className="overview-card">
          <span className="overview-label"><Tip text={noteText(m.key)}>{m.short ?? m.label}</Tip></span>
          <b className="overview-value">{formatMetric(m, nat.v)}{nat.avg ? <small className="muted">（縣市平均）</small> : null}</b>
          {rows.length ? (
            <span className="overview-meta">
              <span>最高　<button type="button" className="link-button" onClick={() => onSelect(rows[0].county)}>{rows[0].county}</button> {formatMetric(m, rows[0].v)}</span>
              <span>最低　<button type="button" className="link-button" onClick={() => onSelect(rows.at(-1)!.county)}>{rows.at(-1)!.county}</button> {formatMetric(m, rows.at(-1)!.v)}</span>
            </span>
          ) : null}
          {extra}
        </div>
      );
    }
    const v = m.value(county);
    const pol = polarityOf(m.key);
    const ranked = valuesOf(m, peers).map((r) => r.v);
    const rank = v === null ? null : ranked.filter((x) => x > v).length + 1;
    // 比率跟基準值比（全國有官方值用官方值，否則用平均）；人數、金額改看占基準的比例
    const natVal = benchmark === 'national' ? m.national?.value(items) ?? null : null;
    const base = natVal ?? (isRateMetric(m) && ranked.length ? ranked.reduce((s, x) => s + x, 0) / ranked.length : null);
    const total = ranked.reduce((s, x) => s + x, 0);
    const compare = v === null
      ? null
      : base !== null
        ? { text: `${benchmarkLabel}${natVal !== null ? '' : '平均'} ${formatMetric(m, base)}`, diff: v - base }
        : { text: `占${benchmarkLabel} ${((v / (total || 1)) * 100).toFixed(1)}%`, diff: null };
    const status = compare?.diff && pol !== 'neutral'
      ? ((pol === 'higher_better') === (compare.diff > 0) ? 'is-good' : 'is-bad')
      : '';
    return (
      <div key={m.key} className={`overview-card ${status}`}>
        <span className="overview-label"><Tip text={noteText(m.key)}>{m.short ?? m.label}</Tip></span>
        <b className="overview-value">{formatMetric(m, v)}</b>
        <span className="overview-meta">
          {rank ? (
            <span className="overview-rank">
              <Tip text={`${COMPARE_NOTES.rank.definition}。${COMPARE_NOTES.rank.meaning}`}>{benchmarkLabel}第 {rank} 高／{ranked.length}</Tip>
            </span>
          ) : <span className="muted">無資料</span>}
          {compare ? (
            <span className="muted">
              <Tip text={`${COMPARE_NOTES.vsNational.definition}。${COMPARE_NOTES.vsNational.meaning}`}>{compare.text}</Tip>
              {compare.diff ? <span className={compare.diff > 0 ? 'overview-up' : 'overview-down'}>{compare.diff > 0 ? ' ▲' : ' ▼'}</span> : null}
            </span>
          ) : null}
        </span>
        {extra}
      </div>
    );
  };

  const towns = county ? demo.data?.towns.filter((t) => t.county === county.county) ?? [] : [];
  const townTrend = new Map((popTrend.data?.towns ?? []).filter((t) => t.county === county?.county).map((t) => [t.town, t]));
  const yearKeys = popTrend.data ? Object.keys(popTrend.data.towns[0]?.population ?? {}).sort() : [];
  const [fromYear, toYear] = [yearKeys.at(-2), yearKeys.at(-1)];
  const townChange = (town: string) => {
    const t = townTrend.get(town);
    return t && fromYear && toYear && t.population[fromYear] ? ((t.population[toYear] - t.population[fromYear]) / t.population[fromYear]) * 100 : null;
  };

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
  const mayorSeats = [...items.reduce((m, c) => {
    const p = c.elections.mayor_2022.candidates[0]?.party ?? '—';
    return m.set(p, (m.get(p) ?? 0) + 1);
  }, new Map<string, number>())].sort((a, b) => b[1] - a[1]);

  // 全國視角：五大分區彙整（比率用區內縣市平均）
  const regional = county ? null : REGIONS.map((r) => {
    const list = items.filter((c) => r.counties.includes(c.county));
    const pop = list.reduce((s, c) => s + c.population, 0);
    const avg = (key: string) => {
      const m = byKey.get(key);
      const vs = m ? valuesOf(m, list).map((x) => x.v) : [];
      return m && vs.length ? formatMetric(m, vs.reduce((s, x) => s + x, 0) / vs.length) : '—';
    };
    return { name: r.name, counties: list.map((c) => c.county), pop, share: (pop / items.reduce((s, c) => s + c.population, 0)) * 100,
      income: avg('income'), elderly: avg('elderly_ratio'), beds: avg('beds_per10k'), revenue: avg('own_revenue_ratio') };
  });

  const mayor = county?.elections.mayor_2022.candidates[0];
  const groups = GROUPS.map((g) => ({ ...g, list: g.keys.map((k) => byKey.get(k)).filter((m): m is Metric => !!m) })).filter((g) => g.list.length);

  return (
    <section className="overview" aria-label={`${scope}總覽`}>
      {county ? (
        <div className="print-only-banner">
          <h1>{county.county}施政重點成績單與治理概況</h1>
          <p>首長：{mayor?.name ?? '—'}（{mayor?.party}）｜ 2022 當選得票率：{mayor?.pct.toFixed(2)}%</p>
        </div>
      ) : null}

      <div className="overview-head">
        <div>
          <h2 className="overview-title">{county ? `${county.county}總覽` : '全國總覽'}</h2>
          <p className="muted">
            {county
              ? `縣長／市長：${mayor?.name ?? '—'}（${mayor?.party ?? '—'}）・人口 ${num(county.population)} 人`
              : `22 個縣市・人口 ${num(items.reduce((s, c) => s + c.population, 0))} 人・點縣市名稱可切到該縣市`}
          </p>
        </div>
        {county ? (
          <div className="overview-tools">
            <span className="field-label">比較基準</span>
            <SubTabs<Benchmark>
              label="比較基準"
              tabs={[{ key: 'national', label: '全國' }, { key: 'tier', label: tierLabel }, { key: 'region', label: region }]}
              value={benchmark}
              onChange={setBenchmark}
            />
            <button type="button" className="print-briefing-btn" onClick={() => window.print()} title="列印或另存為 A4 簡報 PDF">
              <Printer aria-hidden="true" />列印
            </button>
          </div>
        ) : null}
      </div>

      <nav className="overview-jump" aria-label="跳到">
        {county && scorecard && (scorecard.strengths.length || scorecard.weaknesses.length) ? <a href="#ov-scorecard">強弱項</a> : null}
        {regional ? <a href="#ov-regions">區域</a> : null}
        {groups.map((g) => <a key={g.id} href={`#ov-${g.id}`}>{g.title}</a>)}
        <a href="#ov-politics">治理與民意</a>
        <a href="#ov-gaps">{county ? '區內落差' : '縣市落差'}</a>
      </nav>

      <details className="metric-note overview-howto">
        <summary>怎麼看這些卡片？</summary>
        {county ? (
          <>
            <p><b>第幾高</b>　{COMPARE_NOTES.rank.definition}。{COMPARE_NOTES.rank.meaning}</p>
            <p><b>跟基準比</b>　{COMPARE_NOTES.vsNational.definition}。{COMPARE_NOTES.vsNational.meaning}左側綠線＝好於基準、紅線＝差於基準（只標有好壞方向的指標）。</p>
          </>
        ) : (
          <p><b>全國值</b>　比率用官方的全國值（沒有時用 22 縣市平均，會標出來）；人數、金額是縣市加總。</p>
        )}
        <p><b>趨勢線</b>　近幾年同一個指標的走勢，滑過可以看每年的數字；只畫形狀，不同卡片之間的高低不能直接比。</p>
      </details>

      {county && scorecard && (scorecard.strengths.length || scorecard.weaknesses.length) ? (
        <section className="panel scorecard-panel" id="ov-scorecard">
          <h2>強項與待關注</h2>
          <p className="muted">只看有好壞方向的比率類指標（人數、處數會跟著縣市大小走，不列入），依全國 22 縣市排名挑出前後段。</p>
          <div className="scorecard-grid">
            {([['強項', scorecard.strengths, true], ['待關注', scorecard.weaknesses, false]] as const).map(([title, list, good]) => (
              <div key={title} className={`scorecard-col ${good ? 'is-good' : 'is-bad'}`}>
                <h3>{title}（{list.length} 項）</h3>
                {list.length ? (
                  <ul className="scorecard-list">
                    {list.map((s) => (
                      <li key={s.metric.key} className="scorecard-item">
                        <div className="scorecard-item-title">
                          <b>{s.metric.short ?? s.metric.label}</b>
                          <span className={`badge ${good ? 'badge-good' : 'badge-bad'}`}>
                            全國第 {s.rank} {(s.better === 'higher') === good ? '高' : '低'}
                          </span>
                        </div>
                        <div className="scorecard-item-meta">
                          <span className="scorecard-val">{formatMetric(s.metric, s.value)}</span>
                          {s.diff ? <span className="muted">比全國{s.diff > 0 ? '高' : '低'} {diffText(s.metric, s.diff)}</span> : null}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : <p className="muted">沒有落在這一段的指標。</p>}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {regional ? (
        <section className="panel" id="ov-regions">
          <h2>五大區域</h2>
          <p className="muted">國發會區域劃分；所得、高齡比率、病床、自有財源是區內縣市的未加權平均。</p>
          <div className="table-scroll">
            <table className="county-table">
              <thead>
                <tr>
                  <th scope="col">區域</th>
                  <th scope="col">縣市</th>
                  <th scope="col" className="num">人口</th>
                  <th scope="col" className="num">占全國</th>
                  <th scope="col" className="num">每戶可支配所得</th>
                  <th scope="col" className="num">老年人口比率</th>
                  <th scope="col" className="num">每萬人病床</th>
                  <th scope="col" className="num">自有財源比率</th>
                </tr>
              </thead>
              <tbody>
                {regional.map((r) => (
                  <tr key={r.name}>
                    <th scope="row">{r.name}</th>
                    <td className="region-counties">
                      {r.counties.map((c) => <button key={c} type="button" className="chip" onClick={() => onSelect(c)}>{c}</button>)}
                    </td>
                    <td className="num">{num(r.pop)}</td>
                    <td className="num">{r.share.toFixed(1)}%</td>
                    <td className="num">{r.income}</td>
                    <td className="num">{r.elderly}</td>
                    <td className="num">{r.beds}</td>
                    <td className="num">{r.revenue}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      {groups.map((g) => (
        <section key={g.id} className="panel overview-group" id={`ov-${g.id}`}>
          <h2>{g.title}</h2>
          <div className="overview-grid">{g.list.map(card)}</div>
        </section>
      ))}

      <section className="panel overview-group" id="ov-politics">
        <h2>治理與民意</h2>
        <div className="overview-grid">
          {county ? (
            <div className="overview-card">
              <span className="overview-label">2022 縣市長當選</span>
              <b className="overview-value">{mayor?.name ?? '—'}</b>
              <span className="overview-meta">
                <span style={{ color: partyStyle(mayor?.party ?? '').color }}>{mayor?.party}</span>
                <span className="muted">得票率 {mayor?.pct.toFixed(2)}%，領先 {county.elections.mayor_2022.margin_pct?.toFixed(2)} 個百分點</span>
              </span>
            </div>
          ) : (
            <div className="overview-card">
              <span className="overview-label">2022 縣市長當選席次</span>
              <ol className="extremes-list">
                {mayorSeats.map(([party, n]) => <li key={party}><span style={{ color: partyStyle(party).color }}>{party}</span><span className="muted">{n} 席</span></li>)}
              </ol>
            </div>
          )}
          {['mayor_2022.turnout', 'president_2024.turnout'].map((k) => byKey.get(k)).filter((m): m is Metric => !!m).map(card)}
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
              <ol className="extremes-list">
                {presidentNational.map((x) => <li key={x.name}><span style={{ color: partyStyle(x.party).color }}>{x.name}</span><span className="muted">{x.pct.toFixed(2)}%（{num(x.votes)} 票）</span></li>)}
              </ol>
            </div>
          )}
        </div>
      </section>

      {county ? (
        <section className="panel overview-group" id="ov-gaps">
          <h2>區內落差（{towns.length} 個鄉鎮市區）</h2>
          {towns.length ? (
            <div className="overview-grid">
              <Extremes title="65 歲以上比率" format={pct} rows={towns.map((t) => ({ name: t.town, v: t.elderly_ratio }))} />
              <Extremes title={`人口增減率（${fromYear}→${toYear}）`} format={signedPct} rows={towns.map((t) => ({ name: t.town, v: townChange(t.town) }))} />
              <Extremes title="年齡中位數" format={(v) => `${v.toFixed(0)} 歲`} rows={towns.map((t) => ({ name: t.town, v: t.median_age }))} />
              <Extremes title="0–14 歲比率" format={pct} rows={towns.map((t) => ({ name: t.town, v: t.child_ratio }))} />
            </div>
          ) : (
            <p className="muted">{demo.phase === 'loading' ? '載入鄉鎮資料…' : '沒有鄉鎮資料'}</p>
          )}
        </section>
      ) : (
        <section className="panel overview-group" id="ov-gaps">
          <h2>縣市落差</h2>
          <div className="overview-grid">
            {['elderly_ratio', 'pop_growth_rate', 'birth_rate', 'income', 'unemployment', 'own_revenue_ratio']
              .map((k) => byKey.get(k))
              .filter((m): m is Metric => !!m)
              .map((m) => (
                <Extremes key={m.key} title={m.short ?? m.label} format={(v) => formatMetric(m, v)} onSelect={onSelect}
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
      <ol className="extremes-list">{sorted.slice(0, 3).map(show)}</ol>
      <span className="muted">最低</span>
      <ol className="extremes-list">{sorted.slice(-3).reverse().map(show)}</ol>
    </div>
  );
}

/** 近年走勢：純 SVG 折線，標頭尾年份 */
function Sparkline({ series }: { series: Series }) {
  const vs = series.points.map((p) => p.value);
  const [min, max] = [Math.min(...vs), Math.max(...vs)];
  const pts = vs.map((v, i) => `${((i / (vs.length - 1)) * 100).toFixed(1)},${(26 - ((v - min) / (max - min || 1)) * 22).toFixed(1)}`).join(' ');
  return (
    <span className="overview-trend" title={`${series.label}：${series.points.map((p) => `${p.period} ${p.value.toLocaleString('zh-TW')}`).join('、')}`}>
      <svg viewBox="0 0 100 28" preserveAspectRatio="none" aria-hidden="true">
        <polyline points={pts} />
      </svg>
      <small className="muted">{series.points[0].period}–{series.points.at(-1)!.period}</small>
    </span>
  );
}
