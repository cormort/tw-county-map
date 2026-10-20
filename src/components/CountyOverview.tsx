import { useState, useMemo } from 'react';
import { buildUrl } from '../api/client';
import type { CountyItem, CountyTrendsResponse, DemographicsResponse, PopulationTrendResponse } from '../api/types';
import { useApi } from '../hooks/useApi';
import { COMPARE_NOTES, noteFor, polarityOf } from '../lib/metricNotes';
import { Tip, noteText } from './Tip';
import { partyStyle } from '../lib/parties';
import { CountyOptions, REGIONS, SIX_METROS } from './CountyOptions';

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

  const [benchmark, setBenchmark] = useState<'national' | 'tier' | 'region'>('national');

  // 計算縣市首長專屬「強弱項成績單」（依極性與排名百分比評估）
  const scorecard = useMemo(() => {
    if (!county) return null;
    const scored: {
      metric: OverviewMetric;
      displayRank: number;
      total: number;
      percentile: number;
      isStrength: boolean;
      polarity: 'higher_better' | 'lower_better';
      diff: number | null;
      value: number;
    }[] = [];

    for (const g of GROUPS) {
      for (const k of g.keys) {
        const m = metrics.find((x) => x.key === k);
        if (!m) continue;
        const pol = polarityOf(m.key);
        if (pol === 'neutral') continue;
        const v = m.value(county);
        if (v === null) continue;

        // 計算全國排名（同時考慮由高到低與由低到高，並正確處理同分並列）
        const allVals = items.map((c) => m.value(c)).filter((x): x is number => x !== null).sort((a, b) => b - a);
        const total = allVals.length;
        if (total < 5) continue;

        const highRank = allVals.indexOf(v) + 1; // 1 = 數值最高
        const lowRank = allVals.filter((x) => x < v).length + 1; // 1 = 數值最低（並列最低皆為 1）

        const natVal = m.national?.value(items) ?? (allVals.reduce((s, x) => s + x, 0) / allVals.length);
        const diff = v - natVal;

        // 好壞方向：
        // higher_better：highRank 小是優勢（全國第 N 高），lowRank 小是弱項（全國第 N 低）
        // lower_better：lowRank 小是優勢（全國第 N 低），highRank 小是弱項（全國第 N 高）
        const bestRank = pol === 'higher_better' ? highRank : lowRank;
        const worstRank = pol === 'higher_better' ? lowRank : highRank;
        const threshold = Math.max(1, Math.floor(total * 0.35));

        if (bestRank <= threshold) {
          const score = (total - bestRank + 1) / total;
          scored.push({
            metric: m,
            displayRank: bestRank,
            total,
            percentile: Math.round(score * 100),
            isStrength: true,
            polarity: pol,
            diff,
            value: v,
          });
        } else if (worstRank <= threshold) {
          const score = (worstRank - 1) / total;
          scored.push({
            metric: m,
            displayRank: worstRank,
            total,
            percentile: Math.round(score * 100),
            isStrength: false,
            polarity: pol,
            diff,
            value: v,
          });
        }
      }
    }

    const strengths = scored.filter((s) => s.isStrength).sort((a, b) => b.percentile - a.percentile).slice(0, 5);
    const weaknesses = scored.filter((s) => !s.isStrength).sort((a, b) => a.percentile - b.percentile).slice(0, 5);
    return { strengths, weaknesses };
  }, [county, items, metrics]);

  // 同組縣市群組（比較基準）
  const comparisonItems = useMemo((): CountyItem[] => {
    if (!county || benchmark === 'national') return items;
    if (benchmark === 'tier') {
      const isSixMajor = SIX_METROS.includes(county.county);
      return items.filter((c) => SIX_METROS.includes(c.county) === isSixMajor);
    }
    if (benchmark === 'region') {
      const r = REGIONS.find((reg) => reg.counties.includes(county.county));
      return r ? items.filter((c) => r.counties.includes(c.county)) : items;
    }
    return items;
  }, [county, benchmark, items]);

  const benchmarkLabel = benchmark === 'tier' ? (SIX_METROS.includes(county?.county ?? '') ? '六都' : '非六都縣市') : benchmark === 'region' ? (REGIONS.find((r) => r.counties.includes(county?.county ?? ''))?.name ?? '同區域') : '全國';

  const card = (m: OverviewMetric) => {
    if (!county) return nationalCard(m);
    const v = m.value(county);
    const pol = polarityOf(m.key);
    const ranked: number[] = comparisonItems.map((c) => m.value(c)).filter((x): x is number => x !== null).sort((a, b) => b - a);
    const rank = v === null ? null : ranked.indexOf(v) + 1;

    // 比較基準：有全國值且在全國模式時優先用全國值；比率類用平均；數量用占比例
    const natVal = benchmark === 'national' ? (m.national?.value(items) ?? null) : null;
    const baseValue: number | null = natVal !== null
      ? natVal
      : (RATE_UNIT.test(m.unit) && ranked.length > 0
        ? ranked.reduce((s: number, x: number) => s + x, 0) / ranked.length
        : null);

    const totalSum = ranked.reduce((s: number, x: number) => s + x, 0);
    const compare = v === null
      ? null
      : baseValue !== null
        ? { text: `${benchmarkLabel}${m.national && benchmark === 'national' ? '' : '平均'} ${format(m, baseValue)}`, diff: v - baseValue }
        : { text: `占${benchmarkLabel} ${((v / (totalSum || 1)) * 100).toFixed(1)}%`, diff: null };
    const series = seriesOf(m.key);
    const note = noteFor(m.key);

    // 根據 polarity 判斷好/壞或中性
    let statusClass = '';
    if (compare?.diff !== null && compare?.diff !== undefined && compare.diff !== 0 && pol !== 'neutral') {
      const isGood = (pol === 'higher_better' && compare.diff > 0) || (pol === 'lower_better' && compare.diff < 0);
      statusClass = isGood ? 'overview-status-good' : 'overview-status-bad';
    }

    return (
      <div key={m.key} className={`overview-card ${statusClass}`}>
        <span className="overview-label"><Tip text={noteText(m.key)}>{m.short ?? m.label}</Tip></span>
        <b className="overview-value">{format(m, v)}</b>
        <span className="overview-meta">
          {rank ? (
            <span className="overview-rank">
              <Tip text={`${COMPARE_NOTES.rank.definition}。${COMPARE_NOTES.rank.meaning}`}>
                {benchmarkLabel}第 {rank} 高／{ranked.length}
              </Tip>
            </span>
          ) : (
            <span className="muted">無資料</span>
          )}
          {compare ? (
            <span className="muted">
              <Tip text={`${COMPARE_NOTES.vsNational.definition}。${COMPARE_NOTES.vsNational.meaning}`}>{compare.text}</Tip>
              {compare.diff !== null && compare.diff !== 0 ? (
                <span className={compare.diff > 0 ? 'overview-up' : 'overview-down'}>
                  {compare.diff > 0 ? ' ▲' : ' ▼'}
                </span>
              ) : null}
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

  // 全國視角：五大分區（北部、中部、南部、東部、外島）彙整對照
  const regionalSummary = useMemo(() => {
    if (county) return null;
    const totalPop = items.reduce((s, c) => s + c.population, 0);
    return REGIONS.map((r) => {
      const cItems = items.filter((c) => r.counties.includes(c.county));
      const pop = cItems.reduce((s, c) => s + c.population, 0);
      const popPct = totalPop > 0 ? (pop / totalPop) * 100 : 0;

      const getAvg = (key: string): number | null => {
        const m = metrics.find((x) => x.key === key);
        if (!m) return null;
        const vals = cItems.map((c) => m.value(c)).filter((x): x is number => x !== null);
        return vals.length ? vals.reduce((s, x) => s + x, 0) / vals.length : null;
      };

      const income = getAvg('income');
      const elderly = getAvg('elderly_ratio');
      const beds = getAvg('beds_per10k');
      const ownRevenue = getAvg('own_revenue_ratio');

      return {
        name: r.name,
        counties: cItems.map((c) => c.county),
        pop,
        popPct,
        income,
        elderly,
        beds,
        ownRevenue,
      };
    });
  }, [county, items, metrics]);

  return (
    <section className="county-overview" aria-label={`${area}總覽`}>
      {county && (
        <div className="print-only-banner">
          <h1>中華民國 {county.county} 施政重點成績單與治理概況</h1>
          <p>
            首長：{county.elections.mayor_2022.candidates[0]?.name ?? '—'}（{county.elections.mayor_2022.candidates[0]?.party}）｜ 2022 當選得票率：{county.elections.mayor_2022.candidates[0]?.pct.toFixed(2)}% ｜ 資料期：113–114 年最新公務統計
          </p>
        </div>
      )}

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

      {!county && (
        <>
          <section className="panel national-macro-panel">
            <div className="national-macro-header">
              <h2>🇹🇼 中華民國全國治理宏觀指標</h2>
              <span className="muted">全國 22 縣市綜合數據彙整（總統與中央內閣視角）</span>
            </div>
            <div className="national-macro-grid">
              <div className="national-macro-card">
                <span className="macro-label">總人口數</span>
                <b className="macro-val">{items.reduce((s, c) => s + c.population, 0).toLocaleString('zh-TW')} 人</b>
                <span className="macro-sub muted">戶數：{items.reduce((s, c) => s + c.households, 0).toLocaleString('zh-TW')} 戶</span>
              </div>
              <div className="national-macro-card">
                <span className="macro-label">65歲以上高齡人口比</span>
                <b className="macro-val">{((items.reduce((s, c) => s + c.elderly, 0) / (items.reduce((s, c) => s + c.population, 0) || 1)) * 100).toFixed(2)}%</b>
                <span className="macro-sub muted">邁入超高齡社會門檻</span>
              </div>
              <div className="national-macro-card">
                <span className="macro-label">年度出生人口數</span>
                <b className="macro-val">{(() => {
                  const m = byKey.get('births');
                  const v = m ? nationalOf(m).v : null;
                  return v !== null ? `${v.toLocaleString('zh-TW')} 人` : '—';
                })()}</b>
                <span className="macro-sub muted">少子化核心國安課題</span>
              </div>
              <div className="national-macro-card">
                <span className="macro-label">平均每戶可支配所得</span>
                <b className="macro-val">{(() => {
                  const m = byKey.get('income');
                  const v = m ? nationalOf(m).v : null;
                  return v !== null ? `${Math.round(v).toLocaleString('zh-TW')} 元` : '—';
                })()}</b>
                <span className="macro-sub muted">家庭購買力中位水準</span>
              </div>
              <div className="national-macro-card">
                <span className="macro-label">平均失業率</span>
                <b className="macro-val">{(() => {
                  const m = byKey.get('unemployment');
                  const v = m ? nationalOf(m).v : null;
                  return v !== null ? `${v.toFixed(2)}%` : '—';
                })()}</b>
                <span className="macro-sub muted">就業市場活絡度</span>
              </div>
              <div className="national-macro-card">
                <span className="macro-label">地方自籌財源比率</span>
                <b className="macro-val">{(() => {
                  const m = byKey.get('own_revenue_ratio');
                  const v = m ? nationalOf(m).v : null;
                  return v !== null ? `${v.toFixed(2)}%` : '—';
                })()}</b>
                <span className="macro-sub muted">地方財政自主能力</span>
              </div>
            </div>
          </section>

          {regionalSummary && (
            <section className="panel regional-disparity-panel">
              <div className="regional-disparity-header">
                <h2>🗺️ 國土空間與五大區域平衡對照表</h2>
                <p className="muted">國發會區域劃分（北部、中部、南部、東部、外島），檢視人口集中度、所得落差與醫療財政資源配置</p>
              </div>
              <div className="regional-table-wrapper">
                <table className="regional-table">
                  <thead>
                    <tr>
                      <th>分區</th>
                      <th>涵蓋縣市</th>
                      <th className="num">人口數</th>
                      <th className="num">人口佔比</th>
                      <th className="num">平均所得</th>
                      <th className="num">高齡比率</th>
                      <th className="num">每萬人病床</th>
                      <th className="num">自籌財源率</th>
                    </tr>
                  </thead>
                  <tbody>
                    {regionalSummary.map((r) => (
                      <tr key={r.name}>
                        <td><b>{r.name}</b></td>
                        <td>
                          <div className="regional-counties-chips">
                            {r.counties.map((cName) => (
                              <button
                                key={cName}
                                type="button"
                                className="link-button county-chip"
                                onClick={() => onSelectCounty(cName)}
                                title={`切換到 ${cName} 總覽`}
                              >
                                {cName}
                              </button>
                            ))}
                          </div>
                        </td>
                        <td className="num">{r.pop.toLocaleString('zh-TW')}</td>
                        <td className="num"><b>{r.popPct.toFixed(1)}%</b></td>
                        <td className="num">{r.income !== null ? `${Math.round(r.income).toLocaleString('zh-TW')} 元` : '—'}</td>
                        <td className="num">{r.elderly !== null ? `${r.elderly.toFixed(1)}%` : '—'}</td>
                        <td className="num">{r.beds !== null ? `${r.beds.toFixed(1)} 床` : '—'}</td>
                        <td className="num">{r.ownRevenue !== null ? `${r.ownRevenue.toFixed(1)}%` : '—'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </>
      )}

      {county && (
        <div className="panel overview-benchmark-panel">
          <div className="benchmark-bar">
            <span className="benchmark-label">📊 比較基準：</span>
            <div className="button-group">
              <button
                type="button"
                className={`stat-btn ${benchmark === 'national' ? 'active' : ''}`}
                onClick={() => setBenchmark('national')}
              >
                全國（22 縣市）
              </button>
              <button
                type="button"
                className={`stat-btn ${benchmark === 'tier' ? 'active' : ''}`}
                onClick={() => setBenchmark('tier')}
              >
                同級縣市（{SIX_METROS.includes(county.county) ? '六都' : '非六都 16 縣市'}）
              </button>
              <button
                type="button"
                className={`stat-btn ${benchmark === 'region' ? 'active' : ''}`}
                onClick={() => setBenchmark('region')}
              >
                同區域（{REGIONS.find((r) => r.counties.includes(county.county))?.name ?? '同區'}）
              </button>
            </div>
            <span className="benchmark-hint muted">
              下方各指標卡片排位與落差正對標「<b>{benchmarkLabel}</b>」（共 {comparisonItems.length} 縣市）
            </span>
          </div>
        </div>
      )}

      {county && scorecard && (scorecard.strengths.length > 0 || scorecard.weaknesses.length > 0) && (
        <section className="panel scorecard-panel">
          <div className="scorecard-header">
            <div>
              <h2>📋 {county.county} 首長治理重點盤點</h2>
              <p className="muted">
                依各項治理指標之良窳極性（如所得、病床、自籌財源「愈高愈佳」；失業、負債、老化速度「愈低愈佳」），由全國排位精選出該縣市表現最頂尖與最需關注的關鍵指標。
              </p>
            </div>
            <button
              type="button"
              className="print-briefing-btn stat-btn"
              onClick={() => window.print()}
              title="列印或另存為 A4 首長簡報 PDF"
            >
              🖨️ 列印治理簡報
            </button>
          </div>
          <div className="scorecard-grid">
            <div className="scorecard-col scorecard-strengths">
              <h3>🌟 重點優勢（前 {scorecard.strengths.length} 項）</h3>
              <ul className="scorecard-list">
                {scorecard.strengths.map((item) => (
                  <li key={item.metric.key} className="scorecard-item strength">
                    <div className="scorecard-item-main">
                      <div className="scorecard-item-title">
                        <b>{item.metric.short ?? item.metric.label}</b>
                        <span className="badge badge-good">
                          全國第 {item.displayRank} {item.polarity === 'higher_better' ? '高' : '低（負擔輕）'}
                        </span>
                      </div>
                      <div className="scorecard-item-meta">
                        <span className="scorecard-val">{format(item.metric, item.value)}</span>
                        {item.diff !== null && (
                          <span className="muted">
                            較全國{item.diff > 0 ? '高' : '低'} {Math.abs(item.diff).toFixed(item.metric.unit.includes('%') || item.metric.unit.includes('‰') ? 2 : 1)} {item.metric.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>

            <div className="scorecard-col scorecard-weaknesses">
              <h3>⚠️ 待關注弱項（前 {scorecard.weaknesses.length} 項）</h3>
              <ul className="scorecard-list">
                {scorecard.weaknesses.map((item) => (
                  <li key={item.metric.key} className="scorecard-item weakness">
                    <div className="scorecard-item-main">
                      <div className="scorecard-item-title">
                        <b>{item.metric.short ?? item.metric.label}</b>
                        <span className="badge badge-bad">
                          全國第 {item.displayRank} {item.polarity === 'higher_better' ? '低' : '高（負擔重）'}
                        </span>
                      </div>
                      <div className="scorecard-item-meta">
                        <span className="scorecard-val">{format(item.metric, item.value)}</span>
                        {item.diff !== null && (
                          <span className="muted">
                            較全國{item.diff > 0 ? '高' : '低'} {Math.abs(item.diff).toFixed(item.metric.unit.includes('%') || item.metric.unit.includes('‰') ? 2 : 1)} {item.metric.unit}
                          </span>
                        )}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </section>
      )}

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
