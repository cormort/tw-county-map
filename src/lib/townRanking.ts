import type { DemographicTown, PartyBucket } from '../api/types';
import type { Metric } from './metrics';

/**
 * 鄉鎮市區層級有資料的縣市指標。
 *
 * 鄉鎮市區只有三類資料（見 /demographics、/population-trend）：人口、年齡結構、選舉。
 * 醫療、房價、農業、財政、能源那些只有縣市層級，所以「地圖」分頁的排行在選了縣市之後，
 * 只有這裡列得出來的指標會改排鄉鎮，其餘仍排 22 個縣市（並在畫面上一句話說明）。
 */

/** 鄉鎮市區有得票資料的選舉 */
const TOWN_ELECTIONS = new Set(['president_2024', 'president_2020']);

/** 這個指標（縣市層級）在鄉鎮市區層級算得出來嗎 */
export function hasTownData(key: string): boolean {
  if (key === 'population' || key === 'density' || key === 'elderly_ratio') return true;
  return electionField(key) !== null;
}

/** `president_2024.民主進步黨.pct` → { election, party, field } */
function electionField(key: string): { election: string; party: string | null; field: string } | null {
  const m = /^(president_2024|president_2020)\.(.+)$/.exec(key);
  if (!m) return null;
  const [, election, rest] = m;
  if (rest === 'margin' || rest === 'margin_pct') return { election, party: null, field: rest };
  const pm = /^(.+)\.(pct|votes)$/.exec(rest);
  if (!pm) return null;
  return { election, party: pm[1], field: pm[2] };
}

/** 兩名候選人（政黨票則是政黨）的票數差；沒有前兩名就回 null */
function marginOf(bucket: PartyBucket | null): number | null {
  if (!bucket) return null;
  const votes = Object.values(bucket.votes).sort((a, b) => b - a);
  return votes.length >= 2 ? votes[0] - votes[1] : null;
}

function bucketFor(town: DemographicTown, election: string): PartyBucket | null {
  return (town.elections as Record<string, PartyBucket | null>)[election] ?? null;
}

/**
 * 單一鄉鎮市區在該縣市指標上的數值。
 *
 * @param key      縣市指標的 key（與 Metric.key 相同）
 * @param town     鄉鎮人口與選舉資料
 * @param size     鄉鎮面積（平方公里，人口密度用；沒有就回 null）
 * @param digits   ratio 的位數沒有任何影響：這裡回原始數值，格式化交給 formatMetric
 */
export function townValue(key: string, town: DemographicTown, size: number | null): number | null {
  if (key === 'population') return town.population;
  if (key === 'density') return size !== null && size > 0 ? town.population / size : null;
  if (key === 'elderly_ratio') return town.elderly_ratio;

  const e = electionField(key);
  if (!e || !TOWN_ELECTIONS.has(e.election)) return null;
  const bucket = bucketFor(town, e.election);
  if (!bucket || bucket.valid <= 0) return null;

  if (e.field === 'margin') return marginOf(bucket);
  if (e.field === 'margin_pct') {
    const margin = marginOf(bucket);
    return margin === null ? null : (margin / bucket.valid) * 100;
  }
  if (!e.party) return null;
  const votes = bucket.votes[e.party];
  if (votes === undefined) return null;
  return e.field === 'votes' ? votes : (votes / bucket.valid) * 100;
}

/**
 * 該縣市所有鄉鎮市區的排行（由高到低）。
 * 值算不出來的鄉鎮直接略過，不回 null 讓畫面出現空列。
 */
export function rankTowns(
  metric: Pick<Metric, 'key'>,
  towns: DemographicTown[],
  sizes: Map<string, number>,
): { key: string; town: string; v: number }[] {
  return towns
    .map((t) => {
      const k = t.county + t.town;
      const v = townValue(metric.key, t, sizes.get(k) ?? null);
      return v === null ? null : { key: k, town: t.town, v };
    })
    .filter((r): r is { key: string; town: string; v: number } => r !== null)
    .sort((a, b) => b.v - a.v);
}
