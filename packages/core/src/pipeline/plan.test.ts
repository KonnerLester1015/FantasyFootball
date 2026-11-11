import { describe, expect, it } from 'vitest';

import type { SleeperLeague } from '../sleeper/types';
import * as fixtures from '../test-fixtures';
import { bracketsAreReal, currentSeasonWeek, leagueCurrentWeek, seasonLastWeek } from './plan';

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

describe('leagueCurrentWeek', () => {
  const { leg: _leg, ...settings } = fixtures.league.settings;
  const inSeason: SleeperLeague = { ...fixtures.league, status: 'in_season', settings };

  it('moves on to the next week once the last one is scored', () => {
    expect(leagueCurrentWeek(inSeason, 9)).toBe(10);
  });

  it('trusts Sleeper’s leg when it is further along', () => {
    expect(leagueCurrentWeek({ ...inSeason, settings: { ...inSeason.settings, leg: 11 } }, 9)).toBe(11);
  });

  it('stays on the championship week once every week is scored', () => {
    expect(leagueCurrentWeek(inSeason, 17)).toBe(17);
  });

  it('reads 0 before the season starts and the last week once complete', () => {
    expect(leagueCurrentWeek({ ...inSeason, status: 'pre_draft' }, 0)).toBe(0);
    expect(leagueCurrentWeek({ ...inSeason, status: 'complete' }, 3)).toBe(17);
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
