import { useEffect, useState } from 'react';
import { CountiesPage } from './pages/CountiesPage';

/**
 * 只有一頁：縣市地圖。原本在立委觀測站裡是 `/counties` 那個頁籤，
 * 抽出來變成獨立站之後，立委／議員的 drill-down 沒有對應頁面，所以兩個 callback 都是 no-op。
 */
export function App() {
  const [snapshotAt, setSnapshotAt] = useState<string>('');
  useEffect(() => {
    fetch(`${import.meta.env.BASE_URL}data/_snapshot.json`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSnapshotAt(d?.generated_at ? new Date(d.generated_at).toLocaleString('zh-TW', { hour12: false }) : ''))
      .catch(() => setSnapshotAt(''));
  }, []);

  return (
    <div className="app-shell">
      <header className="app-header">
        <h1 className="app-title">台灣縣市地圖</h1>
        <p className="muted">
          22 個縣市的人口、醫療、房價、經濟、財政、農業與選舉統計。
          {snapshotAt ? ` 資料快照：${snapshotAt}` : ''}
        </p>
      </header>
      <main className="page">
        <CountiesPage refreshToken={0} onOpenId={() => {}} onNavigate={() => {}} />
      </main>
    </div>
  );
}
