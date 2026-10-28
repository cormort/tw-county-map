#!/usr/bin/env node
/**
 * 通知閘門 CLI，給 update_local.sh 用。
 *
 *   node scripts/alert-gate.mjs strike <bucket> <key> [--threshold 3] [--state 路徑]
 *     → 印出 SHOULD_NOTIFY 或 SILENT，後面接一行說明（寫進 log 用）
 *   node scripts/alert-gate.mjs settle <bucket> [--state 路徑]
 *     → 印出 RECOVERED（先前吵過、現在好了）或 QUIET（本來就沒吵）
 *
 * 狀態檔預設 ~/Library/Logs/tw-county-map-alerts.json。
 */
import { homedir } from 'node:os';
import { join } from 'node:path';
import { readState, writeState, strike, settle } from './lib/alert-gate.mjs';

const VALUE_FLAGS = new Set(['state', 'threshold']);
const positional = [];
let cmd = null;
const opts = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a.startsWith('--')) {
    const name = a.slice(2);
    if (VALUE_FLAGS.has(name)) {
      opts[name] = argv[i + 1];
      i++;
    } else {
      opts[name] = 'true';
    }
  } else if (!cmd) {
    cmd = a;
  } else {
    positional.push(a);
  }
}

const statePath = opts.state || join(homedir(), 'Library/Logs/tw-county-map-alerts.json');
const threshold = Number(opts.threshold || 3);
const usage = () => {
  console.error('用法：alert-gate.mjs strike <bucket> <key> | settle <bucket>');
  process.exit(2);
};

if (cmd === 'strike') {
  const [bucket, ...rest] = positional;
  if (!bucket) usage();
  const state = readState(statePath);
  const r = strike(state, bucket, rest.join(' ') || 'unknown', threshold);
  writeState(statePath, state);
  console.log(
    `${r.notify ? 'SHOULD_NOTIFY' : 'SILENT'} 連續第 ${r.count} 次（自 ${r.since} 起，門檻 ${threshold}）`
  );
} else if (cmd === 'settle') {
  const [bucket] = positional;
  if (!bucket) usage();
  const state = readState(statePath);
  const r = settle(state, bucket, threshold);
  writeState(statePath, state);
  console.log(r.recovered ? `RECOVERED 先前連續 ${r.count} 次` : 'QUIET');
} else {
  usage();
}
