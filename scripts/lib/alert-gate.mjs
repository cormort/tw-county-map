/**
 * 通知閘門：同一件事不要每天都吵。
 *
 * 規則：同一個 bucket 內、同一個 key 連續第 N 次（預設 3）才發通知；
 * 中間換了 key 就從 1 重算（今天壞工廠、明天壞人口，算兩件不同的事）。
 * 恢復正常時，只有「之前已經吵過（count ≥ N）」才發一次「恢復」，避免又多一則噪音。
 *
 * 狀態檔很脆弱（被刪、壞掉、格式舊），一律當作「沒紀錄」處理，不能因此讓更新流程掛掉。
 */
import { readFileSync, writeFileSync, mkdirSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';

/** @typedef {{key:string,count:number,since:string}} BucketState */

/** 讀狀態檔；壞掉就回空物件（呼叫端不需要 try/catch） */
export function readState(file) {
  try {
    const data = JSON.parse(readFileSync(file, 'utf8'));
    return data && typeof data === 'object' ? data : {};
  } catch {
    return {};
  }
}

/** 原子寫回（先寫暫存檔再 rename），避免半寫入的 JSON */
export function writeState(file, state) {
  mkdirSync(dirname(file), { recursive: true });
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 1));
  renameSync(tmp, file);
}

/**
 * 記一次「這件事發生了」，回傳該不該發通知。
 * @param {Record<string, BucketState>} state 會被就地修改
 * @param {string} bucket source / stale / anomaly
 * @param {string} key 這次的失敗清單（順序無關，呼叫端先排序）
 * @param {number} threshold 連續幾次才通知
 * @param {string} today ISO 日期，用來記錄第一次發生
 */
export function strike(state, bucket, key, threshold = 3, today = new Date().toISOString().slice(0, 10)) {
  const prev = state[bucket];
  const count = prev && prev.key === key ? prev.count + 1 : 1;
  state[bucket] = { key, count, since: prev && prev.key === key ? prev.since ?? today : today };
  return { notify: count >= threshold, count, since: state[bucket].since, quiet: threshold - 1 };
}

/**
 * 記一次「這件事這次沒發生」。若先前已經吵過，回傳 recovered=true 讓呼叫端發一則恢復通知。
 * @returns {{recovered:boolean, count:number}}
 */
export function settle(state, bucket, threshold = 3) {
  const prev = state[bucket];
  delete state[bucket];
  return { recovered: Boolean(prev && prev.count >= threshold), count: prev?.count ?? 0 };
}

export function describe(result, label, threshold = 3) {
  if (!result.notify) {
    return `（${label} 連續第 ${result.count} 次，未達 ${threshold} 次，先不吵）`;
  }
  return `（${label} 已連續 ${result.count} 次，自 ${result.since} 起）`;
}
