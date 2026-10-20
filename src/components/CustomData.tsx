import { useState, type DragEvent, type FormEvent } from 'react';
import type { CountyStatsResponse } from '../api/types';
import { parseRows, toCountyStats } from '../lib/customData';

/**
 * 手動載入資料（參考 json_xml_reader）：API 網址或本機檔案，有縣市欄就能把數值欄變成指標。
 * ponytail: 只放在記憶體裡，重新整理就沒了；要分享再考慮存進網址或 localStorage。
 */
export function CustomData({ counties, loaded, onLoad, onClear }: {
  counties: string[];
  loaded: number;
  onLoad: (stats: CountyStatsResponse) => void;
  onClear: () => void;
}) {
  const [url, setUrl] = useState('');
  const [proxy, setProxy] = useState(true);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = (text: string, name: string) => {
    try {
      const r = toCountyStats(parseRows(text), counties, name);
      onLoad(r.stats);
      setMessage({
        ok: true,
        text: [
          `已從「${name}」加入 ${r.stats.fields.length} 個指標（縣市欄：${r.countyColumn}，對到 ${r.matched} 個縣市），在主題「自訂」裡：${r.stats.fields.map((f) => f.label).join('、')}。`,
          r.unmatched.length ? `沒算進去的列：${r.unmatched.slice(0, 8).join('、')}${r.unmatched.length > 8 ? '…' : ''}。` : '',
          r.duplicated.length ? `重複的縣市取最後一列：${r.duplicated.join('、')}。` : '',
        ].join(''),
      });
    } catch (error) {
      setMessage({ ok: false, text: `「${name}」無法載入：${(error as Error).message}` });
    }
  };

  const fromUrl = async (event: FormEvent) => {
    event.preventDefault();
    if (!url.trim()) return;
    setBusy(true);
    const name = url.replace(/[?#].*$/, '').split('/').filter(Boolean).pop() ?? url;
    try {
      let response: Response;
      try {
        response = await fetch(url);
      } catch (error) {
        // 多數政府 API 沒開 CORS：直連失敗才走公用代理
        if (!proxy) throw error;
        response = await fetch(`https://api.allorigins.win/raw?url=${encodeURIComponent(url)}`);
      }
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      load(await response.text(), name);
    } catch (error) {
      setMessage({ ok: false, text: `「${name}」下載失敗：${(error as Error).message}` });
    } finally {
      setBusy(false);
    }
  };

  const fromFile = async (file: File | undefined) => {
    if (file) load(await file.text(), file.name);
  };
  const onDrop = (event: DragEvent) => {
    event.preventDefault();
    void fromFile(event.dataTransfer.files[0]);
  };

  return (
    <details className="panel custom-data" onDragOver={(event) => event.preventDefault()} onDrop={onDrop}>
      <summary>
        載入自訂資料（JSON／XML／CSV）{loaded ? `・已加入 ${loaded} 個指標` : ''}
      </summary>
      <p className="muted">資料需要有一欄是縣市名稱（「臺北市」或「台北」都可以），其他數字欄位會變成指標。資料只留在你的瀏覽器，重新整理就會清掉。</p>
      <form className="custom-data-row" onSubmit={fromUrl}>
        <input type="url" placeholder="輸入 API 網址（JSON／XML／CSV）" value={url} onChange={(event) => setUrl(event.target.value)} aria-label="API 網址" />
        <button type="submit" disabled={busy}>{busy ? '載入中…' : '載入資料'}</button>
      </form>
      <label className="muted custom-data-proxy">
        <input type="checkbox" checked={proxy} onChange={(event) => setProxy(event.target.checked)} /> 直連失敗時自動透過公用代理（AllOrigins）
      </label>
      <div className="custom-data-row">
        <label className="custom-data-file">
          拖曳檔案到這裡，或<span className="link-button">點擊選擇檔案</span>
          <input className="sr-only" type="file" accept=".json,.xml,.csv,.tsv,.txt" onChange={(event) => { void fromFile(event.target.files?.[0]); event.target.value = ''; }} />
        </label>
        {loaded ? <button type="button" onClick={() => { onClear(); setMessage(null); }}>清除自訂資料</button> : null}
      </div>
      {message ? <p role="status" className={message.ok ? 'muted' : 'error-text'}>{message.text}</p> : null}
    </details>
  );
}
