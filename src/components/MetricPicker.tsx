import { useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { ChevronDown, Search, X } from 'lucide-react';
import { TOPICS, type Metric } from '../lib/metrics';
import { noteText } from './Tip';

/** 搜尋時「台／臺」視為同一字，空白切成多個關鍵字（全部都要出現） */
const normalize = (s: string) => s.replace(/台/g, '臺').toLowerCase();

type Option = Pick<Metric, 'key' | 'label' | 'category' | 'subcategory' | 'unit' | 'short' | 'period'>;

/**
 * 可搜尋的指標選單：取代以前「主題按鈕＋分析指標下拉＋比率／總量切換＋選舉三連動選單」四層控制。
 * 主題降級成選單裡的篩選；選舉三十幾個指標靠搜尋（例如「2024 民進黨 得票率」）就找得到。
 */
export function MetricPicker({ label, metrics, value, onChange, id }: {
  label: string;
  metrics: Option[];
  value: string;
  onChange: (key: string) => void;
  id?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [topic, setTopic] = useState('');
  const [active, setActive] = useState(0);
  const rootRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const listId = useId();
  const current = metrics.find((m) => m.key === value);

  const topics = useMemo(() => {
    const present = new Set(metrics.map((m) => m.category));
    return [...TOPICS.filter((t) => present.has(t)), ...[...present].filter((t) => !TOPICS.includes(t))];
  }, [metrics]);

  const filtered = useMemo(() => {
    const tokens = normalize(query).split(/\s+/).filter(Boolean);
    return metrics.filter((m) => {
      if (topic && m.category !== topic) return false;
      const hay = normalize(`${m.category} ${m.subcategory ?? ''} ${m.label} ${m.unit}`);
      return tokens.every((t) => hay.includes(t));
    });
  }, [metrics, query, topic]);

  // 每次打開都從「全部」開始，游標停在目前的指標
  const openPicker = () => {
    setQuery('');
    setTopic('');
    setOpen(true);
  };
  useEffect(() => {
    if (open) setActive(Math.max(0, filtered.findIndex((m) => m.key === value)));
  }, [open, query, topic]); // 篩選變動時重新定位：目前的指標在結果裡就停在它，不在就停第一筆
  useEffect(() => {
    if (!open) return;
    inputRef.current?.focus();
    const onDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    return () => document.removeEventListener('mousedown', onDown);
  }, [open]);
  useEffect(() => {
    listRef.current?.querySelector('[data-active="true"]')?.scrollIntoView({ block: 'nearest' });
  }, [active, open]);

  const choose = (key: string) => {
    onChange(key);
    setOpen(false);
  };
  const onKeyDown = (event: KeyboardEvent) => {
    if (event.key === 'ArrowDown') { event.preventDefault(); setActive((i) => Math.min(filtered.length - 1, i + 1)); }
    else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((i) => Math.max(0, i - 1)); }
    else if (event.key === 'Enter') { event.preventDefault(); if (filtered[active]) choose(filtered[active].key); }
    else if (event.key === 'Escape') { event.preventDefault(); setOpen(false); }
  };

  // 分組標題：主題（沒篩主題時）＋次分類，連續相同的只印一次
  let lastGroup = '';
  return (
    <div className="metric-picker" ref={rootRef}>
      <span className="field-label" id={`${listId}-label`}>{label}</span>
      <button
        type="button"
        id={id}
        className="metric-picker-trigger"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-labelledby={`${listId}-label ${id ?? ''}`.trim()}
        onClick={() => (open ? setOpen(false) : openPicker())}
      >
        {current ? <span className="metric-picker-topic">{current.category}</span> : null}
        <span className="metric-picker-value">{current?.label ?? '選擇指標'}</span>
        <ChevronDown aria-hidden="true" />
      </button>
      {open ? (
        <div className="metric-picker-pop" role="dialog" aria-label={label}>
          <div className="metric-picker-search">
            <Search aria-hidden="true" />
            <input
              ref={inputRef}
              type="text"
              enterKeyHint="search"
              placeholder="搜尋指標，例如「病床」「2024 民進黨」"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              onKeyDown={onKeyDown}
              role="combobox"
              aria-expanded="true"
              aria-controls={listId}
              aria-activedescendant={filtered[active] ? `${listId}-${active}` : undefined}
              aria-label="搜尋指標"
            />
            <button type="button" className="icon-button" onClick={() => setOpen(false)} aria-label="關閉">
              <X aria-hidden="true" />
            </button>
          </div>
          {topics.length > 1 ? (
            <div className="metric-picker-topics" role="group" aria-label="主題">
              <button type="button" aria-pressed={topic === ''} onClick={() => setTopic('')}>全部</button>
              {topics.map((t) => (
                <button key={t} type="button" aria-pressed={topic === t} onClick={() => setTopic(t)}>{t}</button>
              ))}
            </div>
          ) : null}
          <ul className="metric-picker-list" role="listbox" id={listId} ref={listRef} aria-label={label}>
            {filtered.length ? filtered.map((m, i) => {
              const group = topic ? m.subcategory ?? '' : `${m.category}${m.subcategory && m.subcategory !== m.category ? `・${m.subcategory}` : ''}`;
              const head = group !== lastGroup ? group : '';
              lastGroup = group;
              return (
                <li key={m.key} role="presentation">
                  {head ? <div className="metric-picker-group" role="presentation">{head}</div> : null}
                  <div
                    id={`${listId}-${i}`}
                    role="option"
                    aria-selected={m.key === value}
                    data-active={i === active}
                    className="metric-picker-option"
                    title={noteText(m.key)}
                    onMouseEnter={() => setActive(i)}
                    onClick={() => choose(m.key)}
                  >
                    <span>{m.short ?? m.label}</span>
                    <small className="muted">{[m.period, m.unit].filter(Boolean).join('・')}</small>
                  </div>
                </li>
              );
            }) : <li className="metric-picker-empty muted">找不到符合「{query}」的指標</li>}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
