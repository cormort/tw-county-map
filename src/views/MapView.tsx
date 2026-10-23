import { useState } from 'react';
import { Download, Upload } from 'lucide-react';
import type { CountiesResponse, CountyElection, CountyItem, CountyStatsResponse } from '../api/types';
import { ChoroplethMap } from '../components/ChoroplethMap';
import { CustomData } from '../components/CustomData';
import { MetricPicker } from '../components/MetricPicker';
import { PartyTag } from '../components/PartyTag';
import { Tip, noteText } from '../components/Tip';
import { useParam } from '../hooks/useParam';
import { colorAt, type ScaleName } from '../lib/colorScales';
import { downloadCsv } from '../lib/csv';
import { num, numOrDash, perArea, ratio, RATE_UNIT, isRate } from '../lib/format';
import { formatMetric, formatterOf, valuesOf, type Metric } from '../lib/metrics';
import { noteFor } from '../lib/metricNotes';
import { partyStyle } from '../lib/parties';
import { SubTabs, type View, type ViewContext } from './shared';

type Mode = 'map' | 'ranking' | 'table';
const MODES: { key: Mode; label: string }[] = [
  { key: 'map', label: '地圖' },
  { key: 'ranking', label: '排行' },
  { key: 'table', label: '表格' },
];
const SCALES: { key: ScaleName; label: string }[] = [
  { key: 'YlOrRd', label: '紅' },
  { key: 'Blues', label: '藍' },
  { key: 'Greens', label: '綠' },
  { key: 'Hot', label: '熱力' },
];
const TOP_N = ['10', '全部'];
/** 政黨版圖的圖例（無黨籍也列，縣市長有無黨籍當選） */
const WINNER_LEGEND = ['民主進步黨', '中國國民黨', '台灣民眾黨', '無黨籍'].map((p) => ({ label: partyStyle(p).short, color: partyStyle(p).color }));
/** 縣市明細上方方塊已經列出的人口基本數字，明細表格不再重複 */
const BASIC_KEYS = new Set(['population', 'households', 'area_km2', 'density', 'elderly', 'elderly_ratio']);

/** 名次：由高到低第幾名（並列同名次） */
function rankOf(metric: Metric, items: CountyItem[], county: CountyItem): { rank: number; total: number } | null {
  const v = metric.value(county);
  if (v === null) return null;
  const all = valuesOf(metric, items);
  return { rank: all.filter((r) => r.v > v).length + 1, total: all.length };
}

/**
 * 地圖分頁：左欄選指標（＋說明、統計），中間是地圖／排行／表格（同一個指標），右欄是視角的明細。
 * 地圖永遠在第一屏：手機上指標選單只佔一行，統計與說明排到地圖下面。
 */
export function MapView({ data, metrics, current, onSelect, goView, custom }: ViewContext & {
  custom: { loaded: number; onLoad: (stats: CountyStatsResponse) => void; onClear: () => void };
}) {
  const [metricKey, setMetricKey] = useParam<string>('metric', 'population');
  const [mode, setMode] = useParam<Mode>('sub', 'map', MODES.map((m) => m.key));
  const [scale, setScale] = useParam<ScaleName>('scale', 'YlOrRd', SCALES.map((x) => x.key));
  const [showCustom, setShowCustom] = useState(false);
  const items = data.items;
  const metric = metrics.find((m) => m.key === metricKey) ?? metrics[0];
  const focus = current?.county;

  const mapValues = new Map(items.map((c) => [c.county, metric.value(c)]));
  const winnerOf = (county: string) => {
    const c = items.find((x) => x.county === county);
    return c && metric.partyOf ? metric.partyOf(c) : null;
  };

  return (
    <div className="view-stack">
      {showCustom ? (
        <CustomData
          counties={items.map((c) => c.county)}
          loaded={custom.loaded}
          onLoad={(s) => { custom.onLoad(s); setMetricKey(s.fields[0].key); }}
          onClear={() => { custom.onClear(); if (metric.category === '自訂') setMetricKey('population'); }}
        />
      ) : null}
      <div className="map-view">
        <div className="map-side">
          <MetricPicker id="metric-picker" label="指標" metrics={metrics} value={metric.key} onChange={setMetricKey} />
          <button type="button" className="link-button map-custom-toggle" onClick={() => setShowCustom((v) => !v)} aria-expanded={showCustom}>
            <Upload aria-hidden="true" />
            {showCustom ? '收起自訂資料' : custom.loaded ? `自訂資料（已加入 ${custom.loaded} 個指標）` : '載入自己的資料'}
          </button>
        </div>

        <section className="panel map-main" aria-label={`${metric.label}・${MODES.find((m) => m.key === mode)?.label}`}>
          <div className="map-main-head">
            <SubTabs label="呈現方式" tabs={MODES} value={mode} onChange={setMode} />
            {mode === 'map' && !metric.partyOf ? (
              <div className="segmented scale-picker" role="group" aria-label="地圖配色">
                {SCALES.map((s) => (
                  <button key={s.key} type="button" aria-pressed={scale === s.key} onClick={() => setScale(s.key)} title={`${s.label}色系`}>
                    <i style={{ background: `linear-gradient(90deg, ${colorAt(s.key, 0.1)}, ${colorAt(s.key, 0.9)})` }} aria-hidden="true" />
                    <span className="sr-only">{s.label}色系</span>
                  </button>
                ))}
              </div>
            ) : null}
          </div>
          {mode === 'map' ? (
            <ChoroplethMap
              items={items}
              values={mapValues}
              scale={scale}
              format={formatterOf(metric)}
              title={metric.label}
              selected={focus}
              onSelect={onSelect}
              colorOf={metric.partyOf ? (county) => { const p = winnerOf(county); return p ? partyStyle(p).color : null; } : undefined}
              legendItems={metric.partyOf ? WINNER_LEGEND : undefined}
              formatCounty={metric.partyOf ? (county) => {
                const cand = metric.election ? items.find((x) => x.county === county)?.elections[metric.election].candidates[0] : null;
                return cand ? `${county}：${cand.party}（${cand.name} ${cand.pct.toFixed(2)}%）` : `${county}：無資料`;
              } : undefined}
            />
          ) : mode === 'ranking' ? (
            <Ranking metric={metric} items={items} focus={focus} onSelect={onSelect} />
          ) : (
            <DataTable data={data} metrics={metrics} metric={metric} focus={focus} onSelect={onSelect} />
          )}
        </section>

        <div className="map-stats">
          <MetricNote metricKey={metric.key} metric={metric} />
          <Stats metric={metric} items={items} />
        </div>

        <aside className="map-detail">
          {current ? (
            <CountyDetail county={current} data={data} metric={metric} metrics={metrics} goView={goView} />
          ) : (
            <NationalDetail metric={metric} items={items} onSelect={onSelect} />
          )}
        </aside>
      </div>
    </div>
  );
}

/** 指標的定義與白話意義（lib/metricNotes.ts）；沒有說明的指標（例如自訂資料）就不顯示 */
function MetricNote({ metricKey, metric }: { metricKey: string; metric: Metric }) {
  const note = noteFor(metricKey);
  const stale = metric.anomaly || Boolean(metric.carriedAt);
  return (
    <>
      {note ? (
        <p className="metric-note">
          <b>定義</b>　{note.definition}
          <br />
          <b>意義</b>　{note.meaning}
        </p>
      ) : null}
      {/* 資料狀態放在地圖旁邊：看某一欄時就知道它是不是今天的 */}
      <p className={stale ? 'metric-freshness stale' : 'metric-freshness muted'}>
        {metric.source ? <>資料來源　{metric.source}・</> : null}
        {metric.anomaly
          ? '這次數值變動過大，已暫停更新（仍然顯示上一版）'
          : metric.carriedAt
            ? `這次沒抓到，沿用 ${metric.carriedAt.slice(0, 10).replace(/-/g, '/')} 的資料`
            : '本次已更新'}
      </p>
    </>
  );
}

/**
 * 指標的全國統計。政黨版圖改列各黨拿下幾個縣市（以前會印出「縣市平均 43.97%」這種沒有意義的數字）；
 * 比率類的「縣市平均」是 22 縣市未加權平均，跟全國值不同，標清楚。
 */
function Stats({ metric, items }: { metric: Metric; items: CountyItem[] }) {
  if (metric.partyOf) {
    const won = new Map<string, number>();
    for (const c of items) {
      const p = metric.partyOf(c);
      if (p) won.set(p, (won.get(p) ?? 0) + 1);
    }
    return (
      <div className="stat-row" aria-label="各黨拿下的縣市數">
        {[...won].sort((a, b) => b[1] - a[1]).map(([p, n]) => (
          <div key={p} className="stat-tile">
            <b className="stat-value">{n} <small>縣市</small></b>
            <span className="stat-label"><PartyTag party={p} /></span>
          </div>
        ))}
      </div>
    );
  }
  const rows = valuesOf(metric, items).sort((a, b) => b.v - a.v);
  if (!rows.length) return <p className="muted">這個指標沒有資料。</p>;
  const sum = rows.reduce((s, r) => s + r.v, 0);
  const rate = metric.kind === 'rate' || RATE_UNIT.test(metric.unit);
  const nationalTile = metric.national
    ? { value: formatMetric(metric, metric.national.value(items)), label: metric.national.label }
    : rate ? null : { value: formatMetric(metric, sum), label: `全國加總（${rows.length} 縣市）` };
  const tiles = [
    ...(nationalTile ? [nationalTile] : []),
    { value: formatMetric(metric, sum / rows.length), label: rate ? '縣市平均（未加權）' : '縣市平均' },
    { value: formatMetric(metric, rows[0].v), label: `最高：${rows[0].county}` },
    { value: formatMetric(metric, rows[rows.length - 1].v), label: `最低：${rows[rows.length - 1].county}` },
  ];
  return (
    <div className="stat-row" aria-label={`數據總覽：${metric.label}`}>
      {tiles.map((t) => (
        <div key={t.label} className="stat-tile">
          <b className="stat-value">{t.value}</b>
          <span className="stat-label">{t.label}</span>
        </div>
      ))}
    </div>
  );
}

function Ranking({ metric, items, focus, onSelect }: { metric: Metric; items: CountyItem[]; focus?: string; onSelect: (county: string) => void }) {
  const [top, setTop] = useParam<string>('top', '全部', TOP_N);
  const all = valuesOf(metric, items).sort((a, b) => b.v - a.v);
  const rows = top === '全部' ? all : all.slice(0, Number(top));
  const max = Math.max(...rows.map((r) => r.v), 0) || 1;
  const min = Math.min(...rows.map((r) => r.v));
  return (
    <>
      <div className="sectionhead">
        <h2>{metric.label}</h2>
        <SubTabs label="顯示名次數" tabs={TOP_N.map((n) => ({ key: n, label: n === '全部' ? '全部' : `前 ${n}` }))} value={top} onChange={setTop} />
      </div>
      <ol className="stat-ranking" aria-label={`${metric.label} 排行`}>
        {rows.map((r, i) => (
          <li key={r.county} aria-current={r.county === focus ? 'true' : undefined}>
            <span className="muted">{i + 1}</span>
            <button type="button" className="link-button" onClick={() => onSelect(r.county)}>{r.county}</button>
            <span className="stat-bar" aria-hidden="true">
              <i style={{ width: `${Math.max(2, (Math.max(r.v, 0) / max) * 100)}%`, background: metric.partyOf ? partyStyle(metric.partyOf(items.find((c) => c.county === r.county)!)).color : colorAt('Viridis', max === min ? 1 : (r.v - min) / (max - min)) }} />
            </span>
            <span className="stat-bar-value">{formatMetric(metric, r.v)}</span>
          </li>
        ))}
      </ol>
    </>
  );
}

/** 表格：列目前主題的指標（選舉有三十幾個，只列前 6 個＋目前選的）；CSV 匯出全部指標 */
function DataTable({ data, metrics, metric, focus, onSelect }: { data: CountiesResponse; metrics: Metric[]; metric: Metric; focus?: string; onSelect: (county: string) => void }) {
  const topicMetrics = metrics.filter((m) => m.category === metric.category && !m.partyOf);
  const columns = topicMetrics.length <= 10 ? topicMetrics : [...new Set([...topicMetrics.slice(0, 6), ...(metric.partyOf ? [] : [metric])])];
  const exportCsv = () =>
    downloadCsv(`縣市統計_${data.population_month}.csv`, [
      ['縣市', ...metrics.map((m) => `${m.label}（${m.unit}）`)],
      ...data.items.map((c) => [
        c.county,
        ...metrics.map((m) => {
          const v = m.value(c);
          return v === null ? '' : isRate(m.unit) ? v.toFixed(2) : m.digits ? v.toFixed(m.digits) : v;
        }),
      ]),
    ]);
  return (
    <>
      <div className="sectionhead">
        <h2>{metric.category}・{columns.length} 個指標</h2>
        <button type="button" onClick={exportCsv}><Download aria-hidden="true" />匯出全部指標 CSV（{metrics.length} 欄）</button>
      </div>
      <div className="table-scroll">
        <table className="county-table">
          <thead>
            <tr>
              <th scope="col">縣市</th>
              {columns.map((m) => (
                <th key={m.key} scope="col" className={m.key === metric.key ? 'num is-current' : 'num'}>
                  <Tip text={noteText(m.key)}>{m.short ?? m.label}</Tip>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.items.map((c) => (
              <tr key={c.county} aria-current={c.county === focus ? 'true' : undefined}>
                <td><button type="button" className="link-button" onClick={() => onSelect(c.county)}>{c.county}</button></td>
                {columns.map((m) => <td key={m.key} className="num">{formatMetric(m, m.value(c))}</td>)}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}

/** 全國視角的右欄：最高、最低各 5 個縣市（點了切換視角） */
function NationalDetail({ metric, items, onSelect }: { metric: Metric; items: CountyItem[]; onSelect: (county: string) => void }) {
  const rows = valuesOf(metric, items).sort((a, b) => b.v - a.v);
  const list = (title: string, part: { county: string; v: number }[]) => (
    <div>
      <h3>{title}</h3>
      <ol className="extremes-list">
        {part.map((r) => (
          <li key={r.county}>
            <button type="button" className="link-button" onClick={() => onSelect(r.county)}>{r.county}</button>
            <span className="muted">{formatMetric(metric, r.v)}</span>
          </li>
        ))}
      </ol>
    </div>
  );
  return (
    <section className="panel county-detail" aria-label="全國">
      <div className="county-detail-head">
        <h2>全國</h2>
      </div>
      <p className="muted">點地圖上的縣市，或從上方「視角」選縣市，就能看該縣市的明細。</p>
      {metric.partyOf ? null : rows.length ? (
        <div className="extremes-grid">
          {list('最高 5 個縣市', rows.slice(0, 5))}
          {list('最低 5 個縣市', rows.slice(-5).reverse())}
        </div>
      ) : (
        <p className="muted">這個指標沒有資料。</p>
      )}
    </section>
  );
}

/** 一場選舉的精簡版：前三名候選人與得票率（完整表格在「選舉」分頁） */
function ElectionBrief({ title, election }: { title: string; election: CountyElection }) {
  return (
    <div className="election-brief">
      <h3>{title}</h3>
      <ol>
        {election.candidates.slice(0, 3).map((c) => (
          <li key={c.name}>
            <span><b>{c.name}</b> <PartyTag party={c.party} /></span>
            <span className="num">{num(c.pct, 2)}%</span>
          </li>
        ))}
      </ol>
      <small className="muted">
        {election.turnout !== null ? `投票率 ${num(election.turnout, 2)}%・` : ''}有效票 {num(election.valid)}
      </small>
    </div>
  );
}

/**
 * 縣市明細：目前指標在這個縣市的數值與名次 → 人口基本數字 → 同主題的其他指標（或選舉結果）。
 * 不再依主題藏東西：選舉結果在任何指標下都看得到精簡版。
 */
function CountyDetail({ county, data, metric, metrics, goView }: { county: CountyItem; data: CountiesResponse; metric: Metric; metrics: Metric[]; goView: (view: View, sub?: string) => void }) {
  const items = data.items;
  const value = metric.value(county);
  const rank = rankOf(metric, items, county);
  const winner = metric.partyOf?.(county);
  const topicMetrics = metric.category === '選舉' ? [] : metrics.filter((m) => m.category === metric.category && !BASIC_KEYS.has(m.key));
  const e = data.elections;
  return (
    <section className="panel county-detail" aria-label={`${county.county}詳細資料`}>
      <div className="county-detail-head">
        <h2>{county.county}</h2>
        <div className="county-detail-links">
          <button type="button" onClick={() => goView('overview')}>縣市總覽</button>
          <button type="button" onClick={() => goView('population', 'towns')}>鄉鎮地圖</button>
        </div>
      </div>

      <div className="detail-focus">
        <span className="muted">{metric.short ?? metric.label}</span>
        {winner ? (
          <b className="stat-value"><PartyTag party={winner} /></b>
        ) : (
          <b className="stat-value">{formatMetric(metric, value)}</b>
        )}
        {rank && !winner ? <span className="detail-rank">全國第 {rank.rank} 高／{rank.total}</span> : null}
      </div>

      <dl className="detail-facts">
        <div><dt><Tip text={noteText('population')}>人口</Tip></dt><dd>{num(county.population)} 人</dd></div>
        <div><dt>戶數</dt><dd>{num(county.households)} 戶</dd></div>
        <div><dt><Tip text={noteText('elderly_ratio')}>65 歲以上</Tip></dt><dd>{numOrDash(ratio(county.elderly, county.population), 2)}%</dd></div>
        <div><dt><Tip text={noteText('density')}>人口密度</Tip></dt><dd>{numOrDash(perArea(county.population, county.area_km2))} 人／km²</dd></div>
      </dl>

      {topicMetrics.length ? (
        <div className="table-scroll">
          <table className="county-table detail-table">
            <caption>{metric.category}的其他指標</caption>
            <tbody>
              {topicMetrics.map((m) => (
                <tr key={m.key} aria-current={m.key === metric.key ? 'true' : undefined}>
                  <th scope="row"><Tip text={noteText(m.key)}>{m.short ?? m.label}</Tip></th>
                  <td className="num">{formatMetric(m, m.value(county))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}

      <div className="election-briefs">
        <ElectionBrief title={`${e.mayor_2022.label}`} election={county.elections.mayor_2022} />
        <ElectionBrief title={`${e.president_2024.label}`} election={county.elections.president_2024} />
      </div>
      <button type="button" className="link-button" onClick={() => goView('elections')}>完整選舉結果、議員席次與區域立委 →</button>
    </section>
  );
}
