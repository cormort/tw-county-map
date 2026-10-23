import { AlertTriangle, Clock } from 'lucide-react';
import type { CountyStatsResponse } from '../api/types';

/**
 * 資料新鮮度提示：告訴訪客「今天這份資料有沒有全部更新」。
 *
 * 以前只有 Telegram 通知（給維護的人），網站上看不出來 —— 訪客看到的期間（例如「2025 學年度」）
 * 本來就是資料自己的時間，不代表這份檔案今天抓到。這裡把 runner 寫在 meta 裡的狀態翻成白話。
 *
 * 沒有異常就完全不顯示（不要多一行雜訊）。
 */
const dateOf = (iso?: string | null) => (iso ? iso.slice(0, 10).replace(/-/g, '/') : null);

const ownerName = (id: string | null | undefined) => {
  switch (id) {
    case 'medical': return '醫療';
    case 'house-price': return '房價';
    case 'farmland': return '農地';
    case 'population': return '人口';
    case 'population-change': return '人口動態';
    case 'care': return '長照';
    case 'income': return '所得與失業';
    case 'fiscal': return '財政';
    case 'electricity': return '用電';
    case 'business': return '公司與商業登記';
    case 'factories': return '工廠';
    case 'labor': return '勞保';
    case 'pension': return '國民年金';
    case 'health-insurance': return '健保';
    case 'indigenous': return '原住民人口';
    case 'education': return '教育';
    case 'population-trends': return '歷年趨勢';
    default: return id ?? '未標示';
  }
};

export function DataFreshness({ stats }: { stats: CountyStatsResponse | null }) {
  const meta = stats?.meta;
  if (!meta) return null;

  const carried = meta.carried ?? [];
  const anomalies = meta.anomalies ?? [];
  const stale = meta.stale_sources ?? [];
  const failed = (meta.sources ?? []).filter((s) => s.status === 'failed');
  if (!carried.length && !anomalies.length && !failed.length) return null;

  // 同一個來源的指標合成一句：「教育（沿用 10/23 的資料）」
  const carriedByOwner = new Map<string, { keys: number; at: string | null }>();
  for (const c of carried) {
    const name = ownerName(c.owner);
    const prev = carriedByOwner.get(name);
    carriedByOwner.set(name, { keys: (prev?.keys ?? 0) + 1, at: prev?.at ?? dateOf(c.carried_at) });
  }

  return (
    <div className="freshness" role="status" aria-live="polite">
      <AlertTriangle aria-hidden="true" />
      <div>
        <b>這份資料沒有全部更新</b>
        {carriedByOwner.size ? (
          <span className="freshness-line">
            這次沒抓到、沿用上次的資料：{[...carriedByOwner].map(([name, info]) => `${name}（${info.keys} 個指標${info.at ? `，${info.at}` : ''}）`).join('、')}
          </span>
        ) : null}
        {anomalies.length ? (
          <span className="freshness-line">
            數值變動過大、已暫停更新：{anomalies.map((a) => `${a.label}（中位數變動 ${Math.round(a.median_change * 100)}%）`).join('、')}
          </span>
        ) : null}
        {stale.length ? (
          <span className="freshness-line">
            <Clock aria-hidden="true" /> 改用上次抓到的內容：{stale.map((s) => s.host).join('、')}
          </span>
        ) : null}
      </div>
    </div>
  );
}

/** 單一指標的「沿用」標記：顯示在資料來源列，讓人在看某個指標時就知道這一欄是舊的 */
export function CarriedBadge({ at }: { at?: string | null }) {
  if (!at) return null;
  return <span className="carried-badge" title="這次沒抓到，沿用上一版的數值">沿用 {dateOf(at)}</span>;
}
