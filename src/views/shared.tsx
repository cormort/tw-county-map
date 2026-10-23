import type { CountiesResponse, CountyItem } from '../api/types';
import type { Metric } from '../lib/metrics';

export type View = 'map' | 'overview' | 'compare' | 'elections' | 'population';

/** 每個分頁都拿到的共同資料；分頁自己的檢視狀態（子分頁、配色…）由分頁自己用 useParam 管 */
export interface ViewContext {
  data: CountiesResponse;
  metrics: Metric[];
  /** 「全國」或縣市名稱（header 的視角） */
  scope: string;
  /** 視角是縣市時的資料列；全國為 null */
  current: CountyItem | null;
  /** 點地圖、排行、表格裡的縣市＝切換視角 */
  onSelect: (county: string) => void;
  /** 跨分頁跳轉（例如縣市明細的「鄉鎮地圖」） */
  goView: (view: View, sub?: string) => void;
}

/** 分頁裡的第二層切換（地圖／排行／表格、得票趨勢／立委得票…） */
export function SubTabs<T extends string>({ label, tabs, value, onChange }: {
  label: string;
  tabs: { key: T; label: string }[];
  value: T;
  onChange: (key: T) => void;
}) {
  return (
    <div className="segmented sub-tabs" role="group" aria-label={label}>
      {tabs.map((t) => (
        <button key={t.key} type="button" aria-pressed={value === t.key} onClick={() => onChange(t.key)}>
          {t.label}
        </button>
      ))}
    </div>
  );
}
