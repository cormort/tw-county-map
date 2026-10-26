/**
 * 下載檔案（PDF、zip、CSV）與抓 PDF 文字。政府網站大檔偶爾下載到一半被斷線，
 * 這裡自己再重試 3 次；抓取本身走 fetch-cache（含來源快取）。
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { mkdir, writeFile } from 'node:fs/promises';
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
  // 輸出寫檔案再讀，不要用 stdout 管線：排程在受限環境（Windows sandbox）下 spawn 管線會 EPERM
  const out = `${path}.txt`;
  execFileSync('pdftotext', ['-layout', path, out], { stdio: 'ignore' });
  // 一律用 /\r?\n/ 切：Windows 的 pdftotext 會輸出 CRLF，行尾的 \r 會讓 `(.*)$` 這類解析整個對不到
  return readFileSync(out, 'utf8').split(/\r?\n/);
}

/**
 * 解 zip 到 dir（先建好目錄）。
 *
 * Windows 優先用系統內建的 bsdtar（C:\Windows\System32\tar.exe）：Git 附的 unzip／tar 是 Cygwin 版，
 * 在受限環境（不能開 pipe）會 "couldn't create signal pipe"；macOS／Linux 照用 unzip。
 */
export async function extractZip(zip, dir) {
  await mkdir(dir, { recursive: true });
  if (process.platform === 'win32') {
    execFileSync('C:\\Windows\\System32\\tar.exe', ['-xf', zip, '-C', dir], { stdio: 'ignore' });
  } else {
    execFileSync('unzip', ['-o', zip, '-d', dir], { stdio: 'ignore' });
  }
}
