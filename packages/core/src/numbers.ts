// Numbers are stored as numbers and formatted only at render time (CLAUDE.md).
// This module is the arithmetic half of that rule; nothing here returns a string.

/**
 * Round to hundredths, the precision every Sleeper score and every golden
 * number carries.
 *
 * The epsilon nudge is what keeps 1.005 from rounding down: binary floats store
 * it as 1.00499999…, and the Sheets version used the same correction, so this
 * rounds identically to the numbers in fixtures/golden.
 */
export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
