import { describe, expect, it } from 'vitest';
import league from '../../../config/league.json';

// Scaffold check: config/league.json pins which real league scripts/capture-fixtures.ts
// pulls from, and holds the one app-wide tuning knob (playoffSim) that isn't a fixed
// value. This asserts the file is present and parses. It is not a metric test.

describe('config/league.json', () => {
  it('pins the league fixtures were captured from', () => {
    expect(league.leagueId).toBe('1390575664880418816');
  });

  it('has playoff simulation settings', () => {
    expect(league.playoffSim).toMatchObject({
      simulations: 5000,
      teamSampleWeight: 0.7,
    });
  });
});
