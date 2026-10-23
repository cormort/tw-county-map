/**
 * 下載檔案（PDF、zip、CSV）與抓 PDF 文字。政府網站大檔偶爾下載到一半被斷線，
 * 這裡自己再重試 3 次；抓取本身走 fetch-cache（含來源快取）。
 */
import { execFileSync } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fetchRetry } from './fetch-cache.mjs';

/** 產生一個綁定暫存目錄的 download(url, name) → 回傳本機路徑 */
export function makeDownloader(tmpDir) {
  return async function download(url, name) {
    // 政府網站大檔偶爾會下載到一半被斷線（serv.gcis.nat.gov.tw 實測過），重試 3 次
    for (let attempt = 1; ; attempt++) {
      try {
        const res = await fetchRetry(url);
        if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`);
        const path = join(tmpDir, name);
        await writeFile(path, Buffer.from(await res.arrayBuffer()));
        return path;
      } catch (error) {
        if (attempt >= 3) throw error;
        console.warn(`下載失敗，重試（${attempt}）：${url}`);
        await new Promise((r) => setTimeout(r, 3000 * attempt));
      }
    }
  };
}

/** pdftotext -layout 的逐行結果（需要 poppler：brew install poppler） */
export function pdfLines(path) {
  return execFileSync('pdftotext', ['-layout', path, '-'], { maxBuffer: 1 << 28 }).toString().split('\n');
}
