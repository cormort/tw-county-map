import type { ReactNode } from 'react';
import { noteFor } from '../lib/metricNotes';

/** 指標說明的提示文字（定義＋意義）；沒有說明就回 undefined */
export function noteText(key: string): string | undefined {
  const n = noteFor(key);
  return n ? `定義：${n.definition}\n意義：${n.meaning}` : undefined;
}

/**
 * 滑過（或鍵盤 Tab 停留）時顯示說明的提示框，純 CSS（styles.css 的 .tip）。
 * 手機沒有 hover，所以縣市總覽另外保留「這是什麼？」可以點開。
 */
export function Tip({ text, children }: { text?: string; children: ReactNode }) {
  if (!text) return <>{children}</>;
  return (
    <span className="tip" data-tip={text} tabIndex={0} aria-label={`${typeof children === 'string' ? children : ''}。${text}`}>
      {children}
    </span>
  );
}
