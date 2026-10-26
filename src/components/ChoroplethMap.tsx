import { useContext, useMemo, useState } from 'react';
import { colorAt, gradient, type ScaleName } from '../lib/colorScales';
import { REGIONS } from './CountyOptions';
import { pathBox, REGION_ZOOMS, RegionContext, RegionFirstContext } from '../lib/regionZoom';

/**
 * 被包在鄰縣裡的縣市：新北市、嘉義縣的 path 是沒挖洞的整塊，畫在後面會把臺北市、嘉義市整個蓋住，
 * 滑鼠根本點不到 —— 所以這兩個一定要最後畫。
 */
const ENCLAVES = ['臺北市', '嘉義市'];

/** 縣市圖下方依視角所在分區另畫放大圖（同一份 path，只換 viewBox 裁切）；縣市名稱放在各縣市外框中心 */
function parseBox(viewBox: string) {
  const [x, y, w, h] = viewBox.split(' ').map(Number);
  return { x, y, w, h };
}

/**
 * 面量圖：顏色代表數值（連續色階），滑過或點選顯示數值；金門、連江在左上插圖框。
 * items 的 county 是區塊的鍵與顯示名稱（縣市圖為縣市名，鄉鎮圖為「縣市＋鄉鎮」）。
 */
export function ChoroplethMap({
  items,
  values,
  scale,
  title,
  format,
  diverging = false,
  selected,
  onSelect,
  viewBox = '0 0 530 735',
  outlines = [],
  level = 'county',
  focusOutline,
  colorOf,
  formatCounty,
  legendItems,
  rankScale = false,
}: {
  items: { county: string; path: string }[];
  values: Map<string, number | null>;
  scale: ScaleName;
  title: string;
  format: (value: number | null) => string;
  /** 以 0 為中點的發散色階（時間差異） */
  diverging?: boolean;
  selected?: string;
  onSelect?: (county: string) => void;
  /** 只看某縣市時放大到該範圍 */
  viewBox?: string;
  /** 疊在上方、不上色的外框（例如鄉鎮圖上的縣市界） */
  outlines?: string[];
  /** town：鄉鎮界改淺灰細線，縣市界（outlines）疊深灰粗線 */
  level?: 'county' | 'town';
  /** 特別加粗的外框（相鄰縣市模式的主縣市） */
  focusOutline?: string;
  /** 自訂填色（例如政黨勝選地圖） */
  colorOf?: (county: string, value: number | null) => string | null;
  /** 自訂縣市標示文字（含政黨或候選人） */
  formatCounty?: (county: string, value: number | null) => string;
  /** 類別型圖例（例如政黨色塊圖例） */
  legendItems?: { label: string; color: string }[];
  /** 依排名（分位數）上色，避免極端值讓大部分縣市顯示成同一種淺色 */
  rankScale?: boolean;
}) {
  const [hover, setHover] = useState<string | null>(null);

  // 只採計「有限的數字」：undefined（Map 沒有這個鍵、或資料檔少了欄位）與 NaN（除以 0、
  // 基期缺值）都會讓 Math.min/Math.max 變成 NaN，色階算出來是 NaN，而 NaN 進到 CSS fill
  // 會被瀏覽器直接忽略 —— 整張圖沒有顏色，且不會有任何錯誤訊息。
  const { min, max, hasNums } = useMemo(() => {
    const nums = [...values.values()].filter((v): v is number => Number.isFinite(v));
    let lo = nums.length ? Math.min(...nums) : 0;
    let hi = nums.length ? Math.max(...nums) : 0;
    if (diverging) {
      const m = Math.max(Math.abs(lo), Math.abs(hi)) || 1;
      [lo, hi] = [-m, m];
    }
    return { min: lo, max: hi, hasNums: nums.length > 0 };
  }, [values, diverging]);

  const pathByCounty = useMemo(() => new Map(items.map((c) => [c.county, c.path])), [items]);
  const regionName = useContext(RegionContext);
  const regionFirst = useContext(RegionFirstContext);
  // 鄉鎮圖的 key 是「縣市＋鄉鎮」，找不到縣市就不畫放大圖
  const regionCounties = useMemo(() => (REGIONS.find((r) => r.name === regionName)?.counties ?? []).filter((c) => pathByCounty.has(c)), [regionName, pathByCounty]);
  const zooms = useMemo(() => {
    if (!regionCounties.length) return [];
    return (REGION_ZOOMS[regionName] ?? []).map((z) => {
      const vb = parseBox(z.viewBox);
      const labels = (regionName === '外島' ? [] : regionCounties).flatMap((name) => {
        const b = pathBox(pathByCounty.get(name)!);
        const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
        // 只標中心落在這張放大圖裡的縣市
        return cx >= vb.x && cx <= vb.x + vb.w && cy >= vb.y && cy <= vb.y + vb.h ? [{ name, x: cx, y: cy }] : [];
      });
      return { ...z, labels, fontSize: Math.max(4, vb.w * 0.032) };
    });
  }, [regionName, regionCounties, pathByCounty]);
  const ordered = useMemo(
    () => [...items].sort((a, b) => Number(ENCLAVES.includes(a.county)) - Number(ENCLAVES.includes(b.county))),
    [items],
  );

  // 預先算好每個區塊的填色與標籤，避免滑過 368 個鄉鎮時每次 mousemove 重算色階插值
  const prepared = useMemo(() => {
    const sorted = rankScale && !diverging ? [...values.values()].filter((v): v is number => Number.isFinite(v)).sort((a, b) => a - b) : [];
    const t = sorted.length > 1
      ? (v: number) => sorted.filter((x) => x < v).length / (sorted.length - 1)
      : (v: number) => (max === min ? 1 : (v - min) / (max - min));
    return ordered.map((c) => {
      const raw = values.get(c.county);
      const v = typeof raw === 'number' && Number.isFinite(raw) ? raw : null;
      const customColor = colorOf?.(c.county, v);
      const fillStyle = customColor ?? (v === null ? 'var(--seat-off)' : colorAt(scale, t(v)));
      const label = formatCounty ? formatCounty(c.county, v) : `${c.county}：${format(v)}`;
      return { county: c.county, path: c.path, fillStyle, label };
    });
  }, [ordered, values, scale, min, max, colorOf, formatCounty, format, rankScale, diverging]);

  const focus = hover ?? selected ?? null;
  // inset：放大圖裡的區塊不進 Tab 順序（主地圖已經有同一個縣市，不要讓鍵盤走兩遍）
  // dim：選了分區時，放大圖把不屬於這個分區的縣市調淡
  const shapes = (inset: boolean, dim = false) =>
    prepared.map((c) => (
      <path
        key={c.county}
        d={c.path}
        className="county-shape"
        aria-current={c.county === selected ? 'true' : undefined}
        style={{ fill: c.fillStyle, opacity: dim && !regionCounties.includes(c.county) ? 0.3 : undefined }}
        tabIndex={inset ? -1 : 0}
        role="button"
        aria-label={c.label}
        aria-hidden={inset || undefined}
        onMouseEnter={() => setHover(c.county)}
        onMouseLeave={() => setHover(null)}
        onFocus={() => setHover(c.county)}
        onBlur={() => setHover(null)}
        onClick={() => onSelect?.(c.county)}
        onKeyDown={(event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            onSelect?.(c.county);
          }
        }}
      >
        <title>{c.label}</title>
      </path>
    ));
  const overlays = (
    <>
      {hover && hover !== selected ? <OutlineOverlay d={pathByCounty.get(hover)} className="map-hover" /> : null}
      {selected ? <OutlineOverlay d={pathByCounty.get(selected)} className="map-selected" /> : null}
    </>
  );
  return (
    <figure className="stat-map">
      <figcaption>{title}</figcaption>
      <svg viewBox={viewBox} role="group" aria-label={title} className={level === 'town' ? 'map-town' : undefined} style={regionFirst && zooms.length ? { order: 2 } : undefined}>
        {/* 金門、連江的插圖框 */}
        <rect className="county-inset" x="22" y="4" width="128" height="112" rx="6" />
        <rect className="county-inset" x="3" y="166" width="66" height="54" rx="6" />
        {shapes(false)}
        {outlines.map((d, i) => (
          <path key={i} d={d} className="map-outline" />
        ))}
        {focusOutline ? <path d={focusOutline} className="map-outline map-outline-focus" /> : null}
        {/* 選取／滑過的外框：SVG 沒有 z-index，區塊自己的描邊會被後面畫的鄰區蓋掉而時有時無，
            所以另外在最上層畫一份不接收滑鼠的外框（白色光暈墊底＋細線） */}
        {overlays}
        <text x="26" y="134" className="county-inset-label">連江縣</text>
        <text x="6" y="238" className="county-inset-label">金門縣</text>
      </svg>
      {zooms.length ? (
        <div className={`stat-map-zooms${zooms.length > 1 ? ' is-multi' : ''}`}>
          {zooms.map((z) => (
            <div key={z.label} className="stat-map-north" data-region-zoom={regionName}>
              <span className="muted">{z.label}</span>
              <svg viewBox={z.viewBox} aria-hidden="true">
                {shapes(true, regionFirst)}
                {overlays}
                {z.labels.map((l) => (
                  <text key={l.name} x={l.x} y={l.y} className="stat-map-north-label" style={{ fontSize: z.fontSize }}>
                    {l.name.slice(0, 2)}
                  </text>
                ))}
              </svg>
            </div>
          ))}
        </div>
      ) : null}
      <p className="stat-map-hover" aria-live="polite" style={regionFirst && zooms.length ? { order: 1 } : undefined}>
        {focus ? (
          <>
            <b>{focus}</b>　{formatCounty ? formatCounty(focus, values.get(focus) ?? null).replace(`${focus}：`, '') : format(values.get(focus) ?? null)}
          </>
        ) : (
          <span className="muted">滑過或點選地圖看數值</span>
        )}
      </p>
      {legendItems && legendItems.length ? (
        <div className="stat-legend-categories" style={regionFirst && zooms.length ? { order: 1 } : undefined}>
          {legendItems.map((item) => (
            <span key={item.label} className="legend-chip">
              <i style={{ background: item.color }} aria-hidden="true" />
              <span>{item.label}</span>
            </span>
          ))}
        </div>
      ) : hasNums ? (
        <div className="stat-legend" style={regionFirst && zooms.length ? { order: 1 } : undefined}>
          <span>{format(min)}</span>
          <i style={{ background: gradient(scale) }} aria-hidden="true" />
          <span>{format(max)}</span>
          {rankScale && !diverging ? <small className="muted">依排名上色</small> : null}
        </div>
      ) : null}
    </figure>
  );
}

function OutlineOverlay({ d, className }: { d: string | undefined; className: string }) {
  if (!d) return null;
  return (
    <g className={className} aria-hidden="true" pointerEvents="none">
      <path d={d} className="map-ring-halo" />
      <path d={d} className="map-ring-line" />
    </g>
  );
}
