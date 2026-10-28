import { describe, expect, it } from 'vitest';

import * as fixtures from '../test-fixtures';
import { bracketsAreReal, currentSeasonWeek, seasonLastWeek } from './plan';

describe('seasonLastWeek', () => {
  it('ends a six-team, week-15 postseason in week 17', () => {
    expect(seasonLastWeek(fixtures.league)).toBe(17);
  });
});

describe('currentSeasonWeek', () => {
  it('reads the NFL week while the league is in progress', () => {
    expect(currentSeasonWeek(fixtures.league, 6)).toBe(6);
  });

  it('clamps to the championship week rather than reading past it', () => {
    expect(currentSeasonWeek(fixtures.league, 25)).toBe(17);
  });

  it('never goes negative in the offseason', () => {
    expect(currentSeasonWeek(fixtures.league, 0)).toBe(0);
  });

  it('reads as the championship week once the league is complete', () => {
    expect(currentSeasonWeek({ ...fixtures.league, status: 'complete' }, 3)).toBe(17);
  });
});

describe('bracketsAreReal', () => {
  it('is false before two weeks out from the postseason', () => {
    expect(bracketsAreReal(fixtures.league, 6)).toBe(false);
  });

  it('is true from two weeks out from the postseason', () => {
    expect(bracketsAreReal(fixtures.league, 13)).toBe(true);
  });

  it('is true once the league is complete, regardless of the week', () => {
    expect(bracketsAreReal({ ...fixtures.league, status: 'complete' }, 1)).toBe(true);
  });
});
