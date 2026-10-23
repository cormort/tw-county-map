import { useMemo } from 'react';
import { ChoroplethMap } from '../components/ChoroplethMap';
import { EmptyState } from '../components/DataStates';
import { MetricPicker } from '../components/MetricPicker';
import { Tip } from '../components/Tip';
import { useParam } from '../hooks/useParam';
import { isRate, signed } from '../lib/format';
import { buildPairs, formatMetric, formatterOf } from '../lib/metrics';
import { COMPARE_NOTES, noteFor } from '../lib/metricNotes';
import { SubTabs, type ViewContext } from './shared';

type Sub = 'dual' | 'change';
const SUBS: { key: Sub; label: string }[] = [
  { key: 'dual', label: '雙指標對照' },
  { key: 'change', label: '選舉前後變化' },
];

/** 比較：兩個指標並排看分布，或同一項選舉指標前後兩屆的變化率 */
export function CompareView(ctx: ViewContext) {
  const [sub, setSub] = useParam<Sub>('sub', 'dual', SUBS.map((s) => s.key));
  return (
    <div className="view-stack">
      <SubTabs label="比較方式" tabs={SUBS} value={sub} onChange={setSub} />
      {sub === 'dual' ? <Dual {...ctx} /> : <Change {...ctx} />}
    </div>
  );
}

function Dual({ data, metrics, current, onSelect }: ViewContext) {
  const [metricKey, setMetricKey] = useParam<string>('metric', 'population');
  const [metric2Key, setMetric2Key] = useParam<string>('metric2', 'elderly_ratio');
  const numeric = metrics.filter((m) => !m.partyOf);
  const a = numeric.find((m) => m.key === metricKey) ?? numeric[0];
  const b = numeric.find((m) => m.key === metric2Key) ?? numeric[1];
  const items = data.items;
  const focus = current?.county;
  return (
    <>
      <div className="compare-pickers">
        <MetricPicker id="metric-a" label="左圖指標" metrics={numeric} value={a.key} onChange={setMetricKey} />
        <MetricPicker id="metric-b" label="右圖指標" metrics={numeric} value={b.key} onChange={setMetric2Key} />
      </div>
      <div className="compare-maps">
        {[{ m: a, scale: 'Blues' as const }, { m: b, scale: 'OrRd' as const }].map(({ m, scale }, i) => (
          <section key={i} className="panel">
            <ChoroplethMap items={items} values={new Map(items.map((c) => [c.county, m.value(c)]))} scale={scale} format={formatterOf(m)} title={m.label} selected={focus} onSelect={onSelect} />
          </section>
        ))}
      </div>
      <section className="panel">
        <div className="table-scroll">
          <table className="county-table">
            <thead>
              <tr>
                <th scope="col">縣市</th>
                <th scope="col" className="num">{a.short ?? a.label}</th>
                <th scope="col" className="num">{b.short ?? b.label}</th>
              </tr>
            </thead>
            <tbody>
              {items.map((c) => (
                <tr key={c.county} aria-current={c.county === focus ? 'true' : undefined}>
                  <td><button type="button" className="link-button" onClick={() => onSelect(c.county)}>{c.county}</button></td>
                  <td className="num">{formatMetric(a, a.value(c))}</td>
                  <td className="num">{formatMetric(b, b.value(c))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

function Change({ data, metrics, current, onSelect }: ViewContext) {
  const pairs = useMemo(() => buildPairs(metrics, data), [metrics, data]);
  const [pairKey, setPairKey] = useParam<string>('pair', 'president_2024.民主進步黨.pct');
  const pair = pairs.find((p) => p.key === pairKey) ?? pairs[0];
  if (!pair) return <EmptyState message="目前沒有可對比的兩場選舉" hint="需要同一類選舉至少兩屆的資料。" />;
  const focus = current?.county;
  const note = noteFor(pair.newer.key);
  // 變化率 =（新 − 舊）÷ 舊
  const rows = data.items.map((c) => {
    const a = pair.older.value(c);
    const b = pair.newer.value(c);
    return { county: c.county, a, b, diff: a === null || b === null ? null : b - a, rate: a === null || b === null || a === 0 ? null : ((b - a) / a) * 100 };
  });
  const options = pairs.map((p) => ({ key: p.key, label: p.label, category: '選舉', subcategory: p.newer.subcategory, unit: p.newer.unit }));
  return (
    <>
      <div className="compare-pickers">
        <MetricPicker id="pair-picker" label="比較指標（前次 → 最近一次）" metrics={options} value={pair.key} onChange={setPairKey} />
      </div>
      <p className="metric-note">
        {note ? <><b>指標</b>　{note.definition}；{note.meaning}<br /></> : null}
        <b>差異</b>　{COMPARE_NOTES.diff.definition}。{COMPARE_NOTES.diff.meaning}
        <br />
        <b>變化率</b>　{COMPARE_NOTES.rate.definition}。{COMPARE_NOTES.rate.meaning}
      </p>
      <div className="compare-change">
        <section className="panel">
          <ChoroplethMap
            items={data.items}
            values={new Map(rows.map((r) => [r.county, r.rate]))}
            scale="RdYlGn"
            diverging
            format={(v) => (v === null ? '無可比較資料' : `${signed(v, 1)}%`)}
            title={`${pair.label} 變化率`}
            selected={focus}
            onSelect={onSelect}
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
                {[...rows].sort((x, y) => (y.rate ?? -Infinity) - (x.rate ?? -Infinity)).map((r) => (
                  <tr key={r.county} aria-current={r.county === focus ? 'true' : undefined}>
                    <td><button type="button" className="link-button" onClick={() => onSelect(r.county)}>{r.county}</button></td>
                    <td className="num">{formatMetric(pair.older, r.a)}</td>
                    <td className="num">{formatMetric(pair.newer, r.b)}</td>
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
  );
}
