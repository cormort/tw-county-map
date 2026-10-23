import type { CountiesResponse, CountyStatsResponse } from '../api/types';
import { CarriedBadge } from './DataFreshness';

/** 頁尾資料來源：counties.json 自帶的來源＋county-stats.json 各指標的來源（同名來源合成一條，資料集各自編號連結） */
export function Sources({ data, stats, snapshotAt }: { data: CountiesResponse; stats: CountyStatsResponse | null; snapshotAt: string }) {
  const groups = new Map<string, { urls: string[]; carriedAt: string | null }>();
  for (const f of stats?.fields ?? []) {
    if (!f.url) continue;
    const label = `${f.source}（${f.period}）`;
    const group = groups.get(label) ?? { urls: [], carriedAt: null };
    if (!group.urls.includes(f.url)) group.urls.push(f.url);
    group.carriedAt ??= f.carried_at ?? null; // 這一組只要有一欄沿用就標記
    groups.set(label, group);
  }
  const link = (href: string, text: string) => <a href={href} target="_blank" rel="noreferrer noopener">{text}</a>;
  return (
    <details className="sources">
      <summary>
        資料來源（{data.sources.length + groups.size} 項）{snapshotAt ? `・快照 ${snapshotAt}` : ''}
      </summary>
      <ul>
        {data.sources.map((s) => <li key={s.url}>{link(s.url, s.label)}</li>)}
        {[...groups].map(([label, { urls, carriedAt }]) => (
          <li key={label}>
            {urls.length === 1 ? link(urls[0], label) : (
              <>
                {label}（資料集
                {urls.map((url, i) => <span key={url}>{i ? '、' : ' '}{link(url, String(i + 1))}</span>)}
                ）
              </>
            )}
            <CarriedBadge at={carriedAt} />
          </li>
        ))}
      </ul>
      <p className="muted">統計地圖的顏色代表數值；選舉表中的顏色代表黨籍。「前次同黨得票」以政黨對照，無黨籍不比較。各指標的算法與限制見 DATA_SOURCES.md。</p>
    </details>
  );
}
