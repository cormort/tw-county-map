import { createContext } from 'react';

/** 目前視角所在的分區（北部／中部／南部／東部／外島）；各地圖下方的放大圖依此裁切 */
export const RegionContext = createContext<string>('北部');

/** 視角選了分區時為 true：放大圖排在上面，全島地圖移到下方 */
export const RegionFirstContext = createContext<boolean>(false);

/**
 * 各分區放大圖的 viewBox（與全國圖同一份 path，只換裁切範圍）。
 * 外島三組島嶼彼此很遠，各畫一張。
 */
export const REGION_ZOOMS: Record<string, { label: string; viewBox: string }[]> = {
  北部: [{ label: '北部放大', viewBox: '295 30 230 220' }],
  中部: [{ label: '中部放大', viewBox: '140 145 280 275' }],
  南部: [{ label: '南部放大', viewBox: '145 370 200 240' }],
  東部: [{ label: '東部放大', viewBox: '275 220 205 500' }],
  外島: [
    { label: '澎湖放大', viewBox: '15 335 82 135' },
    { label: '金門放大', viewBox: '5 178 60 40' },
    { label: '連江放大', viewBox: '25 10 120 95' },
  ],
};

/** path 的外框（取座標數字的最小、最大值；縣市 path 都是絕對座標 M/L） */
export function pathBox(d: string): { x: number; y: number; w: number; h: number } {
  const n = (d.match(/-?\d+\.?\d*/g) ?? []).map(Number);
  let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
  for (let i = 0; i + 1 < n.length; i += 2) {
    x0 = Math.min(x0, n[i]); x1 = Math.max(x1, n[i]);
    y0 = Math.min(y0, n[i + 1]); y1 = Math.max(y1, n[i + 1]);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}
