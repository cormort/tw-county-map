/**
 * 獨立站沒有多頁路由：`pathFor()` 只用來產生「在這裡看不到」的跨頁連結，
 * 所以回一個 hash，點了不會把 SPA 帶去不存在的頁面。
 */
export type Route = string;

export function pathFor(route: Route, params: Record<string, string> = {}): string {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => Boolean(v))).toString();
  return `#${route}${qs ? `?${qs}` : ''}`;
}
