/**
 * 抓網址＋來源快取。所有政府網站都走這裡，一個站掛掉只會影響它自己的欄位。
 *
 * 每次呼叫：3 次重試（退避 2／5／10 秒、每次 30 秒上限）→ 成功就把內容存進
 * `.cache/sources/<sha1(url)>`（不進 git）→ 三次都失敗就改用**這個網址**上一次成功的內容，
 * 並把主機記進 `staleSources`，由 runner 寫進 `meta.stale_sources`。
 *
 * 驗收鉤子：`COUNTY_STATS_FAIL_HOST=stats.moe.gov.tw` 會假裝該主機連不上（正式排程不設）。
 */
import { createHash } from 'node:crypto';
import { mkdir, readFile, stat, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * 抓網址：3 次、退避 2／5／10 秒、每次 30 秒上限，成功就把內容存進來源快取。
 * 三次都失敗時改用**這個網址**上一次成功的內容（`fallbackToCache`）並記進 `meta.stale_sources`。
 *
 * 2026-10-23 10:30 那次就是死在這裡：`stats.moe.gov.tw` 連線 10 秒逾時（Node fetch 的預設值），
 * 一支來源掛掉，整個腳本從頭中止，80 個指標一個都沒寫出來、全部沿用舊檔 —— 那次才發現
 * 「重試」只能擋抖一下，擋不住「對方停機半天」。
 *
 * 驗收用的鉤子：`COUNTY_STATS_FAIL_HOST=stats.moe.gov.tw node scripts/county-stats.mjs`
 * 會假裝那個主機連不上，用來確認「只有它改用快取、其他來源照常」這條路（正式排程不會設）。
 */
export async function fetchRetry(url, { retries = 3, timeoutMs = 30_000, label = '' } = {}) {
  let lastError;
  // 除錯／驗收用：假裝某個主機連不上，驗「改用快取」這條路（正式排程不會設）
  const failHost = process.env.COUNTY_STATS_FAIL_HOST ?? '';
  if (failHost && String(url).includes(failHost)) {
    lastError = new Error(`（驗證用）跳過 ${failHost}`);
    console.warn(`[fetch] （驗證用）跳過 ${label || failHost}`);
    return fallbackToCache(url, lastError);
  }
  for (let attempt = 1; attempt <= retries; attempt += 1) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(timeoutMs) });
      if (res.ok) await writeCache(url, Buffer.from(await res.clone().arrayBuffer()));
      return res;
    } catch (error) {
      lastError = error;
      const wait = [0, 2000, 5000, 10_000][attempt] ?? 10_000;
      const why = error?.cause?.code ?? error?.name ?? String(error);
      const where = label || String(url).replace(/^https?:\/\//, '').split(/[/?]/)[0];
      console.warn(`[fetch] ${where} 第 ${attempt}/${retries} 次失敗（${why}）${attempt < retries ? `，${wait / 1000} 秒後重試` : ''}`);
      if (attempt < retries) await new Promise((resolve) => setTimeout(resolve, wait));
    }
  }
  return fallbackToCache(url, lastError);
}

/* ---------- 來源快取（同一個網址上一次成功的內容） ----------
 *
 * 2026-10-23：教育部統計處連線逾時，整支腳本中止、80 個指標全部沿用舊檔。
 * 重試（3 次）擋不住「對方主機停機半天」這種情況，所以再補一層：每個來源成功抓到的內容都存一份，
 * 真的連不上時改用**那個來源自己的**上一份內容 —— 其他 16 個來源照樣更新，
 * 而不是一個網站掛掉就整天資料不動。
 *
 * 誠實原則：用了快取就要講出來 —— 寫進 `meta.stale_sources`（含快取日期）並印 `[stale]` 一行，
 * 排程腳本會把它變成「⚠️ 有 N 個來源沿用快取」的通知，不會安靜地假裝全部都是新的。
 */
const CACHE_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '.cache', 'sources');
export const staleSources = new Map();

const cachePathOf = (url) => join(CACHE_DIR, createHash('sha1').update(String(url)).digest('hex'));

async function writeCache(url, buf) {
  try {
    await mkdir(CACHE_DIR, { recursive: true });
    await writeFile(cachePathOf(url), buf);
  } catch (error) {
    console.warn(`[cache] 寫入失敗（不影響結果）：${error?.message ?? error}`);
  }
}

async function readCache(url) {
  try {
    const path = cachePathOf(url);
    const [buf, info] = await Promise.all([readFile(path), stat(path)]);
    return { buf, at: info.mtime };
  } catch {
    return null;
  }
}

/** 用快取內容組一個「像 fetch 回應」的物件：這個腳本只用到 ok／status／text／json／arrayBuffer */
function cachedResponse(buf) {
  const ab = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
  return {
    ok: true,
    status: 200,
    statusText: 'OK (from cache)',
    arrayBuffer: async () => ab,
    text: async () => buf.toString('utf8'),
    json: async () => JSON.parse(buf.toString('utf8')),
  };
}

async function fallbackToCache(url, error) {
  const cached = await readCache(url);
  if (!cached) throw error;
  const host = String(url).replace(/^https?:\/\//, '').split(/[/?]/)[0];
  const at = cached.at.toISOString().slice(0, 16).replace('T', ' ');
  if (!staleSources.has(host)) console.warn(`[stale] ${host} 抓不到（${error?.cause?.code ?? error?.message ?? error}），改用 ${at} 的快取`);
  staleSources.set(host, { host, cached_at: cached.at.toISOString(), url: String(url) });
  return cachedResponse(cached.buf);
}
