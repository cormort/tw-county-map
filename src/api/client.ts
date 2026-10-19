/**
 * 資料層：這個站是**快照站**。
 *
 * 原本的立委觀測站由 Node 後端即時算 `/api/v1/*`；抽成獨立站之後不可能帶著 SQLite 與爬蟲，
 * 所以 `scripts/snapshot.mjs` 先把各端點的回應存成 `public/data/<slug>.json`，
 * 這裡的 `apiRequest()` 只負責把 URL 換成對應的檔名（不會連到任何後端）。
 *
 * slug 規則：`/api/v1/split-ticket?year=2024` → `split-ticket-year-2024`
 */
export const API_BASE = '/api/v1';

export type ApiQueryValue = string | number | boolean | null | undefined;

/** 後端錯誤（HTTP 4xx/5xx）或網路／逾時錯誤的統一表示（與立委觀測站同一套介面） */
export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(message: string, options: { status?: number; code?: string; cause?: unknown } = {}) {
    super(message, options.cause === undefined ? undefined : { cause: options.cause });
    this.name = 'ApiError';
    this.status = options.status ?? 0;
    this.code = options.code ?? (this.status === 0 ? 'network_error' : 'http_error');
  }

  get isAbort(): boolean {
    return this.code === 'aborted';
  }
}

export function toApiError(err: unknown): ApiError {
  if (err instanceof ApiError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ApiError(message, { code: 'network_error', cause: err });
}

export function buildUrl(path: string, query: Record<string, ApiQueryValue> = {}): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === '') continue;
    params.set(key, String(value));
  }
  const qs = params.toString();
  return `${API_BASE}${path}${qs ? `?${qs}` : ''}`;
}

/** `/api/v1/council?only=counties` → `council-only-counties` */
export function slugFor(url: string): string {
  const parsed = new URL(url, 'http://localhost/');
  const base = parsed.pathname.replace(/^\/api\/v1\//, '').replace(/\/$/, '');
  const extra = [...parsed.searchParams.entries()]
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}-${value}`);
  return [base, ...extra].join('-').replace(/[^a-zA-Z0-9-]/g, '');
}

export interface RequestOptions {
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function apiRequest<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { signal } = options;
  const slug = slugFor(path);
  const root = `${import.meta.env.BASE_URL}data`.replace(/\/{2,}/g, '/');

  for (const candidate of [slug, slugFor(path).split('-year-')[0]]) {
    if (signal?.aborted) throw new ApiError('請求已取消', { code: 'aborted' });
    const response = await fetch(`${root}/${candidate}.json`, { signal });
    if (!response.ok) continue;
    return (await response.json()) as T;
  }
  throw new ApiError(`這份快照裡沒有 ${slug}（重跑 npm run snapshot 可以補）`, { status: 404, code: 'not_found' });
}
