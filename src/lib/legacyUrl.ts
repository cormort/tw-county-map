/**
 * 舊網址相容：改版前是「主題 × 12 個分頁」（`?tab=`、`?topic=`），總覽的縣市用 `?area=`。
 * 分享出去的連結不能失效，所以在畫面掛載前把舊參數改寫成新的 `?view=`／`?sub=`／`?county=`。
 */
const LEGACY_TAB: Record<string, [view: string, sub?: string]> = {
  map: ['map'],
  ranking: ['map', 'ranking'],
  data: ['map', 'table'],
  overview: ['overview'],
  population: ['population', 'trend'],
  towns: ['population', 'towns'],
  trend: ['elections', 'trend'],
  legislators: ['elections', 'legislators'],
  split: ['elections', 'split'],
  demographics: ['elections', 'demographics'],
  dual: ['compare', 'dual'],
  compare: ['compare', 'change'],
};

export function migrateLegacyUrl(): void {
  const params = new URLSearchParams(window.location.search);
  let changed = false;
  const tab = params.get('tab');
  if (tab !== null) {
    const target = LEGACY_TAB[tab];
    if (target && !params.has('view')) {
      params.set('view', target[0]);
      if (target[1]) params.set('sub', target[1]);
    }
    params.delete('tab');
    changed = true;
  }
  const area = params.get('area');
  if (area !== null) {
    if (!params.has('county')) params.set('county', area);
    params.delete('area');
    changed = true;
  }
  if (params.has('topic')) {
    params.delete('topic'); // 主題改成指標選單裡的篩選，由指標本身決定
    changed = true;
  }
  if (!changed) return;
  const qs = params.toString();
  window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
}
