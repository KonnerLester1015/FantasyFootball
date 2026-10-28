import { describe, expect, it } from 'vitest';
import { count, NA, pct, pts, signed } from './format';

// CountUp hands every formatter its in-between frames, so each one must turn an
// arbitrary float into a clean string of the metric's own precision.
describe('display formatters', () => {
  it('shows counts as whole numbers, even mid-count-up', () => {
    expect(count(3)).toBe('3');
    expect(count(2.8971774853005785)).toBe('3');
    expect(count(1204)).toBe('1,204');
    expect(count(0)).toBe('0');
  });

  it('keeps two places on points so a score holds its width', () => {
    expect(pts(285.29)).toBe('285.29');
    expect(pts(510)).toBe('510.00');
    expect(pts(81.61999999999999)).toBe('81.62');
    expect(pts(0)).toBe('0.00');
  });

  it('formats signs and percents by their own conventions', () => {
    expect(signed(-0.92)).toBe('-0.92');
    expect(signed(1.6234)).toBe('+1.62');
    expect(pct(63.8612)).toBe('63.86%');
  });

  it('never turns a missing value into zero', () => {
    for (const f of [count, pts, pct, signed]) {
      expect(f(null)).toBe(NA);
      expect(f(undefined)).toBe(NA);
      expect(f(Number.NaN)).toBe(NA);
    }
  });
});
