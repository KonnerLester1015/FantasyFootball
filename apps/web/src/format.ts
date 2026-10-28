// Formatting only: stored numbers in, display strings out. No metric is derived
// here. A missing value is "N/A", never 0 (docs/DATA_MODEL.md "Null means
// unobserved, never zero").

export const NA = 'N/A';

type Maybe = number | null | undefined;
const missing = (v: Maybe): v is null | undefined => v == null || Number.isNaN(v);

const points2 = new Intl.NumberFormat('en-US', { maximumFractionDigits: 2 });
const whole = new Intl.NumberFormat('en-US', { maximumFractionDigits: 0 });
const fixed2 = new Intl.NumberFormat('en-US', {
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

/** 510.00, 455.66 — always two places, so a score keeps its width while it counts up. */
export const pts = (v: Maybe): string => (missing(v) ? NA : fixed2.format(v));
/** 63.86% */
export const pct = (v: Maybe): string => (missing(v) ? NA : `${points2.format(v)}%`);
/** +1.62 / -0.92 / 0 — the sign is the point (luck, margins). */
export const signed = (v: Maybe): string =>
  missing(v) ? NA : v > 0 ? `+${fixed2.format(v)}` : v < 0 ? `-${fixed2.format(-v)}` : '0';
/**
 * 3, 1,204 — whole numbers. Stored counts are integers; rounding here only
 * matters for CountUp's in-between frames, which must never show 2.8971774853005785.
 */
export const count = (v: Maybe): string => (missing(v) ? NA : whole.format(v));

/** Value color for percent charts (DESIGN_BRIEF §1): blue ≥ 60, brown 35–60, red < 35. */
export function pctTone(v: Maybe): 'blue' | 'brown' | 'red' | 'none' {
  if (missing(v)) return 'none';
  return v >= 60 ? 'blue' : v >= 35 ? 'brown' : 'red';
}

export function asOfLabel(iso: string): string {
  return new Date(iso).toLocaleString('en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    timeZoneName: 'short',
  });
}

export const positionLabel = (p: 'inside' | 'outside' | 'tied_at_cutoff' | null): string =>
  p === 'inside' ? 'In top 6' : p === 'tied_at_cutoff' ? 'Tied at cutoff' : p === 'outside' ? 'Outside' : NA;
