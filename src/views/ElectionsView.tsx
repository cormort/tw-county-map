import { buildUrl } from '../api/client';
import type { CountiesResponse, CountyElection, CountyElectionKey, CountyItem, CouncilResponse } from '../api/types';
import { ChoroplethMap } from '../components/ChoroplethMap';
import { CouncilSeats } from '../components/CouncilSeats';
import { Demographics } from '../components/Demographics';
import { LegislatorVotes } from '../components/LegislatorVotes';
import { PartyTag } from '../components/PartyTag';
import { SplitTicket } from '../components/SplitTicket';
import { VoteTrends } from '../components/VoteTrends';
import { useApi } from '../hooks/useApi';
import { useParam } from '../hooks/useParam';
import { num, signed } from '../lib/format';
import { partyVotes } from '../lib/metrics';
import { partyStyle } from '../lib/parties';
import { SubTabs, type ViewContext } from './shared';

type Sub = 'results' | 'trend' | 'legislators' | 'split' | 'demographics';
const SUBS: { key: Sub; label: string }[] = [
  { key: 'results', label: '選舉結果' },
  { key: 'trend', label: '得票趨勢' },
  { key: 'legislators', label: '立委得票' },
  { key: 'split', label: '分裂投票' },
  { key: 'demographics', label: '人口與得票' },
];

/** 選舉：縣市長與總統結果（縣市視角另有議員席次、區域立委），以及歷屆趨勢、立委、分裂投票、人口結構分析 */
export function ElectionsView({ data, current, onSelect }: ViewContext) {
  const [sub, setSub] = useParam<Sub>('sub', 'results', SUBS.map((s) => s.key));
  const focus = current?.county ?? null;
  return (
    <div className="view-stack">
      <SubTabs label="選舉分析" tabs={SUBS} value={sub} onChange={setSub} />
      {sub === 'results' ? (current ? <CountyResults county={current} data={data} /> : <NationalResults data={data} onSelect={onSelect} />) : null}
      {sub === 'trend' ? <VoteTrends data={data} selected={focus} onSelect={onSelect} /> : null}
      {sub === 'legislators' ? <LegislatorVotes county={focus} /> : null}
      {sub === 'split' ? <SplitTicket county={focus} /> : null}
      {sub === 'demographics' ? <Demographics county={focus} /> : null}
    </div>
  );
}

/** 全國：2022 縣市長與 2024 總統的第一名政黨版圖，各黨拿下幾個縣市 */
function NationalResults({ data, onSelect }: { data: CountiesResponse; onSelect: (county: string) => void }) {
  const maps: CountyElectionKey[] = ['mayor_2022', 'president_2024'];
  return (
    <div className="compare-maps">
      {maps.map((key) => {
        const winner = (c: CountyItem) => c.elections[key].candidates[0];
        const won = new Map<string, number>();
        for (const c of data.items) {
          const p = winner(c)?.party;
          if (p) won.set(p, (won.get(p) ?? 0) + 1);
        }
        return (
          <section key={key} className="panel">
            <ChoroplethMap
              items={data.items}
              values={new Map(data.items.map((c) => [c.county, winner(c)?.pct ?? null]))}
              scale="Blues"
              format={(v) => (v === null ? '—' : `${num(v, 2)}%`)}
              title={`${data.elections[key].label}・各縣市第一名`}
              onSelect={onSelect}
              colorOf={(county) => {
                const p = winner(data.items.find((c) => c.county === county)!)?.party;
                return p ? partyStyle(p).color : null;
              }}
              formatCounty={(county) => {
                const w = winner(data.items.find((c) => c.county === county)!);
                return w ? `${county}：${w.name}（${w.party} ${w.pct.toFixed(2)}%）` : `${county}：無資料`;
              }}
              legendItems={[...won].sort((a, b) => b[1] - a[1]).map(([p, n]) => ({ label: `${partyStyle(p).short} ${n}`, color: partyStyle(p).color }))}
            />
          </section>
        );
      })}
      <p className="muted compare-maps-note">點縣市切換視角，就能看該縣市完整的選舉表、議員席次與區域立委。</p>
    </div>
  );
}

function CountyResults({ county, data }: { county: CountyItem; data: CountiesResponse }) {
  const council = useApi<Pick<CouncilResponse, 'counties'>>(buildUrl('/council', { only: 'counties' }));
  const e = data.elections;
  return (
    <div className="election-results">
      {/* 首長視角第一優先：縣市長選舉得票與勝負 */}
      <ElectionTable
        title={`${e.mayor_2022.label}（${county.county === '嘉義市' ? '2022-12-18 延期選舉' : e.mayor_2022.date}）`}
        current={county.elections.mayor_2022}
        previous={county.elections.mayor_2018}
        previousLabel={e.mayor_2018.label}
      />
      <ElectionTable
        title={`${e.president_2024.label}（${e.president_2024.date}）`}
        current={county.elections.president_2024}
        previous={county.elections.president_2020}
        previousLabel={e.president_2020.label}
      />
      <section className="panel">
        <h2>區域立委</h2>
        <div className="county-legislators">
          {county.legislators.length ? county.legislators.map((l) => (
            <span key={l.id} className="county-legislator">
              <b>{l.name}</b>
              <PartyTag party={l.party} />
              <small className="muted">{l.area_name}</small>
            </span>
          )) : <span className="muted">尚無資料</span>}
        </div>
      </section>
      {/* 議員席次只有六都有建置資料 */}
      {council.data?.counties.includes(county.county) ? <section className="panel"><CouncilSeats county={county.county} /></section> : null}
    </div>
  );
}

/** 一場選舉：各候選人得票、與前次同黨得票的增減、第一名與第二名的差距 */
function ElectionTable({ title, current, previous, previousLabel }: { title: string; current: CountyElection; previous: CountyElection; previousLabel: string }) {
  const [first, second] = current.candidates;
  return (
    <section className="panel county-election">
      <h2>{title}</h2>
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
                  <td><PartyTag party={c.party} /></td>
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
            <li key={c.name}>{c.name} <PartyTag party={c.party} /> {num(c.votes)} 票（{num(c.pct, 2)}%）</li>
          ))}
        </ul>
      </details>
    </section>
  );
}
