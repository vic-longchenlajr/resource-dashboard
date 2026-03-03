import { useRef, useEffect, useState } from 'react';
import { formatMonth } from '../utils/format';

// ── Module-level utilities (exported for ViewHeader) ─────────────────────────

export function addMonths(ym: string, delta: number): string {
  const [y, m] = ym.split('-').map(Number);
  const total = y * 12 + (m - 1) + delta;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${String(nm).padStart(2, '0')}`;
}

export function monthsBetween(from: string, to: string): string[] {
  const result: string[] = [];
  let cur = from;
  while (cur <= to) {
    result.push(cur);
    cur = addMonths(cur, 1);
  }
  return result;
}

function currentYearMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
}

function getQuarterRange(ym: string): [string, string] {
  const [y, m] = ym.split('-').map(Number);
  const qStart = Math.floor((m - 1) / 3) * 3 + 1;
  const qEnd = qStart + 2;
  return [
    `${y}-${String(qStart).padStart(2, '0')}`,
    `${y}-${String(qEnd).padStart(2, '0')}`,
  ];
}

export function computeLabel(from: string | null, to: string | null): string {
  if (!from && !to) return 'All Time';
  if (!from || !to) return formatMonth((from ?? to)!);
  if (from === to) return formatMonth(from);

  const [fy, fm] = from.split('-').map(Number);
  const [ty, tm] = to.split('-').map(Number);

  // Full calendar year
  if (fm === 1 && tm === 12 && fy === ty) return String(fy);

  // Exact quarter boundary of same year
  if (fy === ty) {
    const [qStart, qEnd] = getQuarterRange(from);
    if (qStart === from && qEnd === to) {
      return `Q${Math.ceil(fm / 3)} ${fy}`;
    }
  }

  // YTD: January of a year through the current month
  const now = currentYearMonth();
  const [ny, nm] = now.split('-').map(Number);
  if (fm === 1 && fy === ty && ty === ny && tm === nm) return `YTD ${fy}`;

  return `${formatMonth(from)} — ${formatMonth(to)}`;
}

// ── Component ─────────────────────────────────────────────────────────────────

const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

type Shortcut = { label: string; f: string | null; t: string | null };

export interface MonthRangePickerProps {
  from: string | null;
  to: string | null;
  onChange: (from: string | null, to: string | null) => void;
  availableMonths: string[];
  mode?: 'historical' | 'forward';
}

export function MonthRangePicker({
  from,
  to,
  onChange,
  availableMonths,
  mode = 'historical',
}: MonthRangePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [activePicker, setActivePicker] = useState<'from' | 'to' | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const now = currentYearMonth();
  const nowYear = Number(now.split('-')[0]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setActivePicker(null);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const toggle = () => {
    if (isOpen) {
      setIsOpen(false);
      setActivePicker(null);
    } else {
      setIsOpen(true);
      setActivePicker('from');
    }
  };

  const applyShortcut = (f: string | null, t: string | null) => {
    onChange(f, t);
    setIsOpen(false);
    setActivePicker(null);
  };

  const handleMonthClick = (month: string) => {
    if (!availableMonths.includes(month)) return;
    if (activePicker === 'from') {
      onChange(month, to);
      setActivePicker('to');
    } else if (activePicker === 'to') {
      if (from && month < from) {
        onChange(month, from); // swap
      } else {
        onChange(from, month);
      }
      setActivePicker(null);
    }
  };

  // ── Shortcuts ───────────────────────────────────────────────────────────────
  const [qStart, qEnd] = getQuarterRange(now);
  const ytdStart = `${nowYear}-01`;
  const futureMonths = availableMonths.filter(m => m >= now).sort();

  const historicalShortcuts: Shortcut[] = [
    { label: 'This Month',    f: now,               t: now },
    { label: 'Last 3 Months', f: addMonths(now, -2), t: now },
    { label: 'This Quarter',  f: qStart,             t: qEnd },
    { label: 'YTD',           f: ytdStart,           t: now },
    { label: 'All Time',      f: null,               t: null },
  ];

  const forwardShortcuts: Shortcut[] = [
    { label: 'Next 3 Months',  f: now, t: addMonths(now, 2) },
    { label: 'Next 6 Months',  f: now, t: addMonths(now, 5) },
    { label: 'Next 12 Months', f: now, t: addMonths(now, 11) },
    {
      label: 'All Planned',
      f: futureMonths.length > 0 ? futureMonths[0] : null,
      t: futureMonths.length > 0 ? futureMonths[futureMonths.length - 1] : null,
    },
    { label: 'All Time', f: null, t: null },
  ];

  const shortcuts = mode === 'forward' ? forwardShortcuts : historicalShortcuts;

  // ── Grid years ──────────────────────────────────────────────────────────────
  const availableYearsSet = new Set(availableMonths.map(m => m.slice(0, 4)));
  availableYearsSet.add(String(nowYear));
  if (mode === 'forward') availableYearsSet.add(String(nowYear + 1));
  const years = [...availableYearsSet].sort();
  if (mode !== 'forward') years.reverse();

  const availableSet = new Set(availableMonths);

  return (
    <div ref={containerRef} className="relative">
      {/* Trigger button */}
      <button
        onClick={toggle}
        className="flex items-center gap-2 text-[13px] font-medium bg-white rounded-md px-3 py-1.5 text-[var(--text-secondary)] transition-colors focus:outline-none focus:ring-2 focus:ring-[var(--accent-focus-ring)]"
        style={{ border: `1px solid ${isOpen ? 'var(--accent)' : 'var(--border-input)'}` }}
      >
        <svg className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
        </svg>
        <span>{computeLabel(from, to)}</span>
        <svg
          className="w-3.5 h-3.5 flex-shrink-0 text-[var(--text-muted)] transition-transform duration-150"
          style={{ transform: isOpen ? 'rotate(180deg)' : undefined }}
          fill="none" stroke="currentColor" viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown panel */}
      {isOpen && (
        <div className="absolute top-full left-0 mt-1 z-50 rounded-xl shadow-xl border border-[var(--border-default)] bg-[var(--bg-panel)]" style={{ width: 360 }}>

          {/* 1. Shortcut pills */}
          <div className="p-3 flex flex-wrap gap-1.5 border-b border-[var(--border-subtle)]">
            {shortcuts.map(sc => {
              const isActive = sc.f === from && sc.t === to;
              return (
                <button
                  key={sc.label}
                  onClick={() => applyShortcut(sc.f, sc.t)}
                  className="text-[11px] font-medium px-2.5 py-1 rounded-full border transition-colors"
                  style={isActive ? {
                    backgroundColor: 'var(--accent-light)',
                    borderColor: 'var(--accent)',
                    color: 'var(--accent)',
                  } : {
                    backgroundColor: 'transparent',
                    borderColor: 'var(--border-default)',
                    color: 'var(--text-muted)',
                  }}
                >
                  {sc.label}
                </button>
              );
            })}
          </div>

          {/* 2. From / To fields */}
          <div className="p-3 flex items-center gap-2 border-b border-[var(--border-subtle)]">
            <PickerField
              label="FROM"
              value={from ? formatMonth(from) : null}
              active={activePicker === 'from'}
              onClick={() => setActivePicker('from')}
            />
            <svg className="w-4 h-4 flex-shrink-0 mt-4 text-[var(--text-muted)]" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 8l4 4m0 0l-4 4m4-4H3" />
            </svg>
            <PickerField
              label="TO"
              value={to ? formatMonth(to) : null}
              active={activePicker === 'to'}
              onClick={() => setActivePicker('to')}
            />
          </div>

          {/* 3. Month grid */}
          <div className="overflow-y-auto" style={{ maxHeight: 260 }}>
            {years.map(year => (
              <YearGrid
                key={year}
                year={year}
                now={now}
                from={from}
                to={to}
                availableSet={availableSet}
                onMonthClick={handleMonthClick}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function PickerField({
  label,
  value,
  active,
  onClick,
}: {
  label: string;
  value: string | null;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <div className="flex-1">
      <p className="text-[9px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1">{label}</p>
      <button
        onClick={onClick}
        className="w-full text-left text-[12px] font-medium px-2.5 py-1.5 rounded-md border transition-colors"
        style={active ? {
          borderColor: 'var(--accent)',
          backgroundColor: 'var(--accent-light)',
          color: 'var(--accent)',
        } : {
          borderColor: 'var(--border-input)',
          backgroundColor: 'transparent',
          color: value ? 'var(--text-primary)' : 'var(--text-muted)',
        }}
      >
        {value ?? '—'}
      </button>
    </div>
  );
}

function YearGrid({
  year,
  now,
  from,
  to,
  availableSet,
  onMonthClick,
}: {
  year: string;
  now: string;
  from: string | null;
  to: string | null;
  availableSet: Set<string>;
  onMonthClick: (month: string) => void;
}) {
  return (
    <div className="px-3 pt-2.5 pb-2">
      <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--text-muted)] mb-1.5">{year}</p>
      <div className="grid grid-cols-4 gap-1">
        {MONTH_NAMES.map((name, i) => {
          const month = `${year}-${String(i + 1).padStart(2, '0')}`;
          const isEndpoint = month === from || month === to;
          const inRange = !!(from && to && month > from && month < to);
          const isCurrent = month === now;
          const isAvailable = availableSet.has(month);

          let bgColor = 'transparent';
          let textColor = isAvailable ? 'var(--text-secondary)' : 'var(--text-muted)';
          let outlineVal: string | undefined;
          let opacity: number | undefined;

          if (isEndpoint) {
            bgColor = 'var(--accent)';
            textColor = 'white';
          } else if (inRange) {
            bgColor = 'var(--accent-light)';
            textColor = 'var(--accent)';
          } else if (!isAvailable) {
            opacity = 0.4;
          }

          if (isCurrent && !isEndpoint) {
            outlineVal = '1.5px dashed var(--accent)';
          }

          return (
            <button
              key={month}
              onClick={() => onMonthClick(month)}
              className={`text-[11px] font-medium rounded py-1 text-center transition-colors${isAvailable && !isEndpoint ? ' hover:bg-[var(--accent-light)] hover:text-[var(--accent)]' : ''}`}
              style={{
                backgroundColor: bgColor,
                color: textColor,
                outline: outlineVal,
                opacity,
                cursor: isAvailable ? 'pointer' : 'default',
              }}
            >
              {name}
            </button>
          );
        })}
      </div>
    </div>
  );
}
