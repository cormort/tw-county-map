import { useEffect, useState } from 'react';
import { CountiesPage } from './pages/CountiesPage';
import { CountyOptions, NATIONAL, REGIONS } from './components/CountyOptions';
import { useParam } from './hooks/useParam';

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

/**
 * 只有一頁：縣市地圖。原本在立委觀測站裡是 `/counties` 那個頁籤，
 * 抽出來變成獨立站之後，立委／議員的 drill-down 沒有對應頁面，所以兩個 callback 都是 no-op。
 *
 * 視角（全國／某縣市）是全站唯一的縣市狀態，放在 header，所有分頁共用：
 * 以前總覽用 `?area=`、其他分頁用 `?county=`，兩邊會各自停在不同縣市。
 */
export function App() {
  const [snapshotAt, setSnapshotAt] = useState<string>('');
  const [home, setHome] = useState<string | null>(readHome);
  // 舊網址的 `?area=`（總覽的範圍）沿用成視角，不讓分享出去的連結失效
  const legacyArea = new URLSearchParams(window.location.search).get('area');
  const [scope, setScope] = useParam<string>('county', legacyArea || home || NATIONAL);
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

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-main">
          <h1 className="app-title">台灣縣市地圖</h1>
          <p className="muted app-subtitle">
            22 個縣市的人口、醫療、房價、經濟、財政、農業與選舉統計。
            {snapshotAt ? ` 資料快照：${snapshotAt}` : ''}
          </p>
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
              title={isHome ? '取消「我的縣市」' : '下次打開直接看這個縣市'}>
              {isHome ? '★ 我的縣市' : '☆ 設為我的縣市'}
            </button>
          ) : null}
          {home && scope !== home ? (
            <button type="button" id="scope-go-home" className="link-button" onClick={() => setScope(home)}>
              回到{home}
            </button>
          ) : null}
          {scope !== NATIONAL ? (
            <button type="button" id="scope-national" className="link-button" onClick={() => setScope(NATIONAL)}>
              看全國
            </button>
          ) : null}
        </div>
      </header>
      <main className="page">
        <CountiesPage refreshToken={0} scope={scope} onScopeChange={setScope} />
      </main>
    </div>
  );
}
