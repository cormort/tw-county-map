import { useMemo, useState } from 'react';
import { buildUrl } from '../api/client';
import type { CouncilResponse, CouncilTerm } from '../api/types';
import { ErrorState, LoadingState } from './DataStates';
import { useApi } from '../hooks/useApi';

/**
 * 縣市明細裡的「議員選舉與席次」。
 *
 * 資料是 `public/data/council-county-<縣市>.json`（只有六都有；`/council` 的快照）。
 * 原本在立委觀測站是指到 `/council` 那一頁，獨立站沒有那一頁，所以在這裡直接攤開：
 * 席次總數、政黨席次、各選舉區的應選席次與最後一席。
 */

const num = (n: number | null | undefined, digits = 0) =>
  n === null || n === undefined || !Number.isFinite(n) ? '—' : n.toLocaleString('zh-TW', { maximumFractionDigits: digits, minimumFractionDigits: digits });

const pct = (n: number | null | undefined) => (n === null || n === undefined || !Number.isFinite(n) ? '—' : `${num(n, 2)}%`);

/**
 * 政黨席次長條：寬度以最大黨為 100%。
 * 只列有拿到席次的政黨——一屆動輒十幾個 0 席小黨，全部列出來會把表拉長到看不完；
 * 其餘在表格下方補一句話說明有幾個政黨候選但沒當選。
 */
function seatBars(term: CouncilTerm) {
  const top = Math.max(1, ...term.parties.map((p) => p.seats));
  return term.parties.filter((p) => p.seats > 0).map((p) => ({ ...p, width: (p.seats / top) * 100 }));
}

export function CouncilSeats({ county }: { county: string }) {
  const res = useApi<CouncilResponse>(buildUrl('/council', { county }), { isEmpty: (d) => d.terms.length === 0 });
  const [picked, setPicked] = useState<number | null>(null);

  const terms = res.data?.terms ?? [];
  const term = useMemo(() => terms.find((t) => t.year === picked) ?? terms[0], [terms, picked]);
  const compare = term?.compare;

  if (res.phase === 'loading') return <LoadingState label="讀取議員席次…" />;
  if (res.phase === 'error') return <ErrorState error={res.error} onRetry={res.reload} title="議員席次" />;
  if (!term) return null;

  return (
    <div className="council-seats">
      <div className="council-seats-head">
        <h3>議員選舉與席次</h3>
        <span className="muted">
          {term.body}・{term.label}・{term.date}
        </span>
      </div>

      {terms.length > 1 ? (
        <div className="chip-row" role="group" aria-label="切換屆次">
          {terms.map((t) => (
            <button key={t.year} type="button" aria-pressed={t.year === term.year} onClick={() => setPicked(t.year)}>
              {t.label}（{t.year}）
            </button>
          ))}
        </div>
      ) : null}

      <div className="stat-row">
        <div className="stat-tile">
          <b className="stat-value">{num(term.seats)}</b>
          <span className="stat-label">議員席次（區域 {num(term.kinds.find((k) => k.kind === 'area')?.seats ?? 0)}、原住民 {num((term.kinds.find((k) => k.kind === 'plain')?.seats ?? 0) + (term.kinds.find((k) => k.kind === 'mountain')?.seats ?? 0))}）</span>
        </div>
        <div className="stat-tile">
          <b className="stat-value">{num(term.stats.area_electorate)}</b>
          <span className="stat-label">區域選舉人數</span>
        </div>
        <div className="stat-tile">
          <b className="stat-value">{pct(term.stats.area_turnout)}</b>
          <span className="stat-label">區域投票率</span>
        </div>
        <div className="stat-tile">
          <b className="stat-value">{num(term.stats.candidates)}</b>
          <span className="stat-label">候選人數</span>
        </div>
      </div>

      <div className="table-scroll">
        <table className="county-table">
          <caption className="muted">政黨席次與得票（{term.label}）</caption>
          <thead>
            <tr>
              <th scope="col">政黨</th>
              <th scope="col" className="num">席次</th>
              <th scope="col" className="num">席次%</th>
              <th scope="col" className="num">得票%</th>
              {compare ? <th scope="col" className="num">較{compare.label}</th> : null}
            </tr>
          </thead>
          <tbody>
            {seatBars(term).map((p) => {
              const prev = compare?.parties.find((x) => x.party === p.party);
              return (
                <tr key={p.party}>
                  <th scope="row">
                    <span className="seat-bar" style={{ width: `${p.width}%` }} aria-hidden="true" />
                    {p.party}
                  </th>
                  <td className="num">{num(p.seats)}</td>
                  <td className="num">{pct(p.seat_pct)}</td>
                  <td className="num">{pct(p.pct)}</td>
                  {compare ? <td className="num">{prev ? (prev.delta > 0 ? `+${prev.delta}` : prev.delta) : '新增'}</td> : null}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {term.parties.some((p) => p.seats === 0) ? (
        <p className="muted small">
          另有 {num(term.parties.filter((p) => p.seats === 0).length)} 個政黨推出候選人但未取得席次（
          {term.parties
            .filter((p) => p.seats === 0)
            .sort((a, b) => b.pct - a.pct)
            .slice(0, 6)
            .map((p) => `${p.party} ${pct(p.pct)}`)
            .join('、')}
          {term.parties.filter((p) => p.seats === 0).length > 6 ? ' 等' : ''}）。
        </p>
      ) : null}

      <div className="table-scroll">
        <table className="county-table">
          <caption className="muted">各選舉區應選席次（{term.label}）</caption>
          <thead>
            <tr>
              <th scope="col">選舉區</th>
              <th scope="col">範圍</th>
              <th scope="col" className="num">應選</th>
              <th scope="col" className="num">候選</th>
              <th scope="col" className="num">選舉人數</th>
              <th scope="col" className="num">投票率</th>
              <th scope="col">最後一席</th>
            </tr>
          </thead>
          <tbody>
            {term.districts.map((d) => (
              <tr key={d.no}>
                <th scope="row">{d.name}</th>
                <td>{d.area.length ? d.area.join('、') : d.kind === 'plain' ? '平地原住民' : '山地原住民'}</td>
                <td className="num">{num(d.seats)}</td>
                <td className="num">{num(d.candidate_count)}</td>
                <td className="num">{num(d.electorate)}</td>
                <td className="num">{pct(d.turnout)}</td>
                <td>
                  {d.last_winner ? (
                    <>
                      {d.last_winner.name}（{d.last_winner.party}）
                      {d.first_loser?.margin ? <small className="muted"> 贏 {num(d.first_loser.margin)} 票</small> : null}
                    </>
                  ) : (
                    <span className="muted">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {compare ? (
        <p className="muted small">
          與{compare.label}相比：連任 {num(compare.re_elected)} 人、新科 {num(compare.freshmen)} 人
          {compare.defeated_incumbents.length ? `、現任落選 ${num(compare.defeated_incumbents.length)} 人（${compare.defeated_incumbents.map((x) => x.name).join('、')}）` : ''}。
          {compare.incumbent_mismatch.length ? ` 中選會現任欄位與上屆名單不一致：${compare.incumbent_mismatch.join('、')}。` : ''}
        </p>
      ) : (
        <p className="muted small">這一屆沒有可比較的上一屆資料。</p>
      )}
    </div>
  );
}
