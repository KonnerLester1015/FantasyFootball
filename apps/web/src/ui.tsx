// The "Sunday Funnies" kit (docs/DESIGN_BRIEF.md): original art, cards, speech
// bubbles, count-up numbers, outlined bar charts, tabs. Renders stored numbers
// only; the one thing computed here is chart geometry (bar length from value).

import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { NA } from './format';

// ---------------------------------------------------------------------------
// Art. Original drawings; decorative, so hidden from assistive tech.
// ---------------------------------------------------------------------------

/** The ball drawing in a 64×64 box, for composing into larger art. */
export function FootballShape({ angle = -28 }: { angle?: number }) {
  return (
    <g transform={`rotate(${angle} 32 32)`}>
      <ellipse cx="32" cy="32" rx="25" ry="15" fill="var(--brown)" stroke="var(--ink)" strokeWidth="4" />
      <path d="M19 32H45" stroke="var(--paper)" strokeWidth="3.5" strokeLinecap="round" />
      <path d="M25 26V38M32 26V38M39 26V38" stroke="var(--paper)" strokeWidth="3" strokeLinecap="round" />
    </g>
  );
}

export function Football({ size = 64, className }: { size?: number; className?: string }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 64 64" aria-hidden="true">
      <FootballShape />
    </svg>
  );
}

export function Helmet() {
  return (
    <svg className="helmet" width="64" height="58" viewBox="0 0 64 58" aria-hidden="true">
      <HelmetShape />
    </svg>
  );
}

/** The helmet drawing in a 64×58 box, facing right, for composing into larger art. */
export function HelmetShape({ shell = 'var(--blue)' }: { shell?: string }) {
  return (
    <g>
      <path
        d="M6 34C4 16 18 4 34 4c15 0 25 10 25 24 0 6-2 10-6 12H36l-4 10H14c-5 0-7-6-8-16z"
        fill={shell}
        stroke="var(--ink)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M30 6c8 3 12 10 13 22" stroke="var(--paper)" strokeWidth="5" fill="none" strokeLinecap="round" />
      <circle cx="22" cy="28" r="5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="3" />
      <path
        d="M36 40h22M44 40v12M36 46h16M52 40c4 2 6 6 6 10"
        stroke="var(--ink)"
        strokeWidth="3.5"
        fill="none"
        strokeLinecap="round"
      />
    </g>
  );
}

/** The hero football: floats and spins over a dashed arc that marches. */
export function HeroFootball() {
  return (
    <div className="hero-art" aria-hidden="true">
      <svg className="hero-arc" viewBox="0 0 200 120">
        <path d="M10 110 Q100 -20 190 110" fill="none" stroke="var(--ink)" strokeWidth="3" strokeDasharray="8 9" />
      </svg>
      <Football size={96} className="hero-ball" />
    </div>
  );
}

export function Spinner({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="spinner" role="status">
      <Football size={56} className="spinner-ball" />
      <span>{label}…</span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Surfaces
// ---------------------------------------------------------------------------

/** `i` cycles the hand-drawn radius and sets the load-in stagger. */
export function Card({
  i = 0,
  className = '',
  children,
  as: Tag = 'section',
  ...rest
}: {
  i?: number;
  className?: string;
  children: ReactNode;
  as?: 'section' | 'article' | 'div';
  'aria-labelledby'?: string;
  'aria-label'?: string;
}) {
  return (
    <Tag className={`card r${i % 5} ${className}`} style={{ '--i': i } as CSSProperties} {...rest}>
      {children}
    </Tag>
  );
}

/** A plain-language definition, in a speech bubble pointing at what it explains. */
export function Bubble({ children, tail = 'up' }: { children: ReactNode; tail?: 'up' | 'left' }) {
  return <p className={`bubble tail-${tail}`}>{children}</p>;
}

/** A metric heading with its definition underneath. */
export function MetricHead({ id, title, def }: { id?: string; title: string; def: string }) {
  return (
    <>
      <h3 id={id}>{title}</h3>
      <Bubble>{def}</Bubble>
    </>
  );
}

export function Chip({ tone, children }: { tone: 'in' | 'out' | 'tie' | 'na'; children: ReactNode }) {
  return <span className={`chip chip-${tone}`}>{children}</span>;
}

// ---------------------------------------------------------------------------
// Numbers
// ---------------------------------------------------------------------------

export const reducedMotion = (): boolean =>
  typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Counts from the previously shown value to the new one over ~0.6 s when data
 * refreshes. Display interpolation only; the final frame is the stored value.
 */
export function CountUp({ value, format }: { value: number | null; format: (v: number | null) => string }) {
  // The in-between number while animating; null means "show the stored value".
  const [between, setBetween] = useState<number | null>(() =>
    value === null || reducedMotion() ? null : 0,
  );
  const from = useRef<number>(0);

  useEffect(() => {
    if (value === null) return;
    const origin = from.current;
    from.current = value;
    if (reducedMotion() || origin === value) {
      // Clear any half-finished count from an interrupted animation.
      const frame = requestAnimationFrame(() => setBetween(null));
      return () => cancelAnimationFrame(frame);
    }
    const start = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / 600);
      setBetween(t === 1 ? null : origin + (value - origin) * (1 - (1 - t) ** 3));
      if (t < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(frame);
      from.current = origin;
    };
  }, [value]);
  const shown = between ?? value;

  return (
    <>
      <span aria-hidden="true">{format(shown)}</span>
      <span className="sr-only">{format(value)}</span>
    </>
  );
}

export function StatCard({
  i,
  label,
  value,
  format,
  name,
  tone,
  def,
  butter = false,
}: {
  i: number;
  label: string;
  value: number | null;
  format: (v: number | null) => string;
  name: ReactNode;
  tone: 'blue' | 'ink' | 'brown' | 'red';
  def?: string;
  butter?: boolean;
}) {
  return (
    <Card i={i} as="article" className={`stat ${butter ? 'butter' : ''}`}>
      <h3 className="stat-label">{label}</h3>
      <p className={`stat-number tone-${tone}`} style={{ '--chars': format(value).length } as CSSProperties}>
        <CountUp value={value} format={format} />
      </p>
      <p className="stat-name">{name}</p>
      {def && <Bubble>{def}</Bubble>}
    </Card>
  );
}

// ---------------------------------------------------------------------------
// Charts — the site's one chart implementation. Horizontal bars in ink-outlined
// tracks, team label on the left, value as text on the right (color is never
// the only signal).
// ---------------------------------------------------------------------------

export interface BarDatum {
  key: string | number;
  label: string;
  value: number | null;
  /** Second series drawn as a thinner bar under the first (e.g. best lineup). */
  ghost?: number | null;
  tone: 'blue' | 'brown' | 'red' | 'ink' | 'none';
}

export function Bars({
  data,
  max,
  format,
  label,
  ghostFormat,
  diverging = false,
}: {
  data: BarDatum[];
  /** Full-track value. Percent charts pass 100. */
  max: number;
  format: (v: number | null) => string;
  label: string;
  ghostFormat?: (v: number | null) => string;
  /** Zero in the middle; negative values grow left. */
  diverging?: boolean;
}) {
  const scale = (v: number) => Math.max(0, Math.min(1, Math.abs(v) / (max || 1)));
  return (
    <ul className={`bars ${diverging ? 'diverging' : ''}`} aria-label={label}>
      {data.map((d, n) => {
        const style = { '--i': n } as CSSProperties;
        return (
          <li key={d.key} className="bar-row" style={style}>
            <span className="bar-label">{d.label}</span>
            <span className="bar-track">
              {d.value !== null && (
                <span
                  className={`bar-fill fill-${d.tone} ${diverging && d.value < 0 ? 'neg' : ''}`}
                  style={{ '--w': diverging ? scale(d.value) / 2 : scale(d.value) } as CSSProperties}
                />
              )}
              {d.ghost != null && (
                <span className="bar-ghost" style={{ '--w': scale(d.ghost) } as CSSProperties} />
              )}
            </span>
            <span className="bar-value">
              {format(d.value)}
              {ghostFormat && d.ghost !== undefined && <small> / {ghostFormat(d.ghost ?? null)}</small>}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Controls
// ---------------------------------------------------------------------------

export function Tabs<K extends string>({
  options,
  value,
  onChange,
  label,
}: {
  options: readonly { key: K; label: string }[];
  value: K;
  onChange: (key: K) => void;
  label: string;
}) {
  return (
    <div className="tabs" role="group" aria-label={label}>
      {options.map((o) => (
        <button
          key={o.key}
          type="button"
          className="tab"
          aria-pressed={o.key === value}
          onClick={() => onChange(o.key)}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function WeekPicker({
  weeks,
  value,
  onChange,
}: {
  weeks: readonly number[];
  value: number;
  onChange: (week: number) => void;
}) {
  return (
    <Tabs
      label="Choose a week"
      value={String(value)}
      onChange={(k) => onChange(Number(k))}
      options={weeks.map((w) => ({ key: String(w), label: `Week ${w}` }))}
    />
  );
}

/** For lists of tied holders: "A / B / C", or N/A when nobody holds it. */
export const names = (list: readonly string[]): string => (list.length > 0 ? list.join(' / ') : NA);
