import { useEffect, useMemo, useState } from 'react';
import { GitCompareArrows, LayoutDashboard, MapIcon, Star, Users, Vote } from 'lucide-react';
import { buildUrl } from './api/client';
import type { CountiesResponse, CountyStatsResponse } from './api/types';
import { CountyOptions, NATIONAL, REGIONS } from './components/CountyOptions';
import { EmptyState, ErrorState, LoadingState } from './components/DataStates';
import { useApi } from './hooks/useApi';
import { useParam } from './hooks/useParam';
import { mergeStats } from './lib/customData';
import { buildMetrics, resolveCounty } from './lib/metrics';
import { DataFreshness } from './components/DataFreshness';
import { Sources } from './components/Sources';
import { MapView } from './views/MapView';
import { OverviewView } from './views/OverviewView';
import { CompareView } from './views/CompareView';
import { ElectionsView } from './views/ElectionsView';
import { PopulationView } from './views/PopulationView';
import type { View, ViewContext } from './views/shared';

/** 「我的縣市」存在瀏覽器裡：縣市首長每次進來直接看到自己的縣市，不用再選一次 */
const HOME_KEY = 'tw-county-map:home';
const ALL_COUNTIES = REGIONS.flatMap((r) => r.counties);

function readHome(): string | null {
  try {
    const v = window.localStorage.getItem(HOME_KEY);
    return v && ALL_COUNTIES.includes(v) ? v : null;
  } catch {
    return null; // 隱私模式等環境下 localStorage 可能丟例外
  }
}

/** 依「要做的事」分頁：地圖探索指標、總覽看一個縣市（或全國）、比較、選舉、人口與鄉鎮 */
const VIEWS: { key: View; label: string; icon: typeof MapIcon }[] = [
  { key: 'map', label: '地圖', icon: MapIcon },
  { key: 'overview', label: '總覽', icon: LayoutDashboard },
  { key: 'compare', label: '比較', icon: GitCompareArrows },
  { key: 'elections', label: '選舉', icon: Vote },
  { key: 'population', label: '人口與鄉鎮', icon: Users },
];

/**
 * 只有一頁，分頁與所有檢視狀態都在網址上（可分享）。
 * 視角（全國／某縣市）是全站唯一的縣市狀態，放在 header，所有分頁共用。
 */
export function App() {
  const [snapshotAt, setSnapshotAt] = useState<string>('');
  const [home, setHome] = useState<string | null>(readHome);
  const [scope, setScope] = useParam<string>('county', home || NATIONAL);
  const [view, setView] = useParam<View>('view', 'map', VIEWS.map((v) => v.key));

  const res = useApi<CountiesResponse>(buildUrl('/counties'));
  // 醫療、房價、農地：沒有這個檔就只是少幾個指標，不擋整頁
  const stats = useApi<CountyStatsResponse>(buildUrl('/county-stats'));
  // 使用者手動載入的資料（CustomData），跟 county-stats.json 合併成同一份
  const [custom, setCustom] = useState<CountyStatsResponse[]>([]);
  const allStats = useMemo(() => mergeStats([stats.data, ...custom]), [stats.data, custom]);
  const metrics = useMemo(() => (res.data ? buildMetrics(res.data, allStats) : []), [res.data, allStats]);

  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/_snapshot.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSnapshotAt(d?.generated_at ? new Date(d.generated_at).toLocaleString('zh-TW', { hour12: false }) : ''))
      .catch(() => setSnapshotAt(''));
  }, []);

  const isHome = scope !== NATIONAL && scope === home;
  const toggleHome = () => {
    const next = isHome ? null : scope;
    try {
      if (next) window.localStorage.setItem(HOME_KEY, next);
      else window.localStorage.removeItem(HOME_KEY);
    } catch {
      /* 存不了就只在這次瀏覽有效 */
    }
    setHome(next);
  };

  // 換分頁時清掉上一個分頁的子分頁，新分頁掛載時讀到的是乾淨的網址
  const goView = (next: View, sub?: string) => {
    const params = new URLSearchParams(window.location.search);
    params.delete('sub');
    if (sub) params.set('sub', sub);
    const qs = params.toString();
    window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    setView(next);
    window.scrollTo({ top: 0 });
  };

  const body = (() => {
    if (res.phase === 'error') return <ErrorState title="無法取得縣市資料（counties.json）" error={res.error} onRetry={res.reload} />;
    if (res.phase === 'loading' && !res.data) return <LoadingState label="載入縣市資料…" />;
    if (!res.data || !res.data.items.length) return <EmptyState message="目前沒有縣市資料" hint="資料是靜態快照（scripts/snapshot.mjs），請確認 public/data/ 有產生。" />;
    const current = scope === NATIONAL ? null : resolveCounty(res.data.items, scope);
    if (scope !== NATIONAL && !current) {
      return <EmptyState message={`找不到縣市「${scope}」`} hint="網址上的 ?county= 可能不是縣市名稱（不分區與原住民沒有縣市頁）。可以從上方「視角」重新選擇。" />;
    }
    const ctx: ViewContext = { data: res.data, metrics, scope, current, onSelect: setScope, goView };
    switch (view) {
      case 'overview': return <OverviewView {...ctx} />;
      case 'compare': return <CompareView {...ctx} />;
      case 'elections': return <ElectionsView {...ctx} />;
      case 'population': return <PopulationView {...ctx} />;
      default:
        return (
          <MapView
            {...ctx}
            custom={{
              loaded: custom.reduce((n, s) => n + s.fields.length, 0),
              // 同一個檔名再載一次＝取代
              onLoad: (s) => setCustom((list) => [...list.filter((x) => x.fields[0]?.source !== s.fields[0].source), s]),
              onClear: () => setCustom([]),
            }}
          />
        );
    }
  })();

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <div className="app-brand">
            <h1 className="app-title">台灣縣市地圖</h1>
            {snapshotAt ? <span className="app-snapshot muted">資料快照 {snapshotAt}</span> : null}
          </div>
          <div className="scope-bar" role="group" aria-label="視角">
            <label className="scope-select">
              <span>視角</span>
              <select id="scope-select" value={scope} onChange={(event) => setScope(event.target.value)}>
                <option value={NATIONAL}>{NATIONAL}</option>
                <CountyOptions counties={ALL_COUNTIES} />
              </select>
            </label>
            {scope !== NATIONAL ? (
              <button type="button" id="scope-home" className="scope-home" aria-pressed={isHome} onClick={toggleHome}
                title={isHome ? '取消「我的縣市」' : '下次打開直接看這個縣市'} aria-label={isHome ? '取消我的縣市' : '設為我的縣市'}>
                <Star aria-hidden="true" fill={isHome ? 'currentColor' : 'none'} />
                <span className="scope-home-text">{isHome ? '我的縣市' : '設為我的縣市'}</span>
              </button>
            ) : null}
            {home && scope !== home ? (
              <button type="button" id="scope-go-home" className="link-button" onClick={() => setScope(home)}>回到{home}</button>
            ) : null}
            {scope !== NATIONAL ? (
              <button type="button" id="scope-national" className="link-button" onClick={() => setScope(NATIONAL)}>看全國</button>
            ) : null}
          </div>
        </div>
        <nav className="view-nav" aria-label="分頁">
          {VIEWS.map(({ key, label, icon: Icon }) => (
            <button key={key} type="button" aria-current={view === key ? 'page' : undefined} onClick={() => goView(key)}>
              <Icon aria-hidden="true" />
              {label}
            </button>
          ))}
        </nav>
      </header>
      <DataFreshness stats={stats.data} />
      <main className="page">{body}</main>
      {res.data ? (
        <footer className="app-footer">
          <Sources data={res.data} stats={stats.data} snapshotAt={snapshotAt} />
        </footer>
      ) : null}
    </div>
  );
}
