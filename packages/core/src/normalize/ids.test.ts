import { describe, expect, it } from 'vitest';
import {
  MAX_ROW_ID_LENGTH,
  assertRowId,
  bracketSlotId,
  dashboardId,
  draftPickId,
  matchupRowId,
  pad,
  playerScoreId,
  teamId,
  weekRowId,
} from './ids';

const LEAGUE = '1390575664880418816'; // 19 of the 36 allowed characters

describe('assertRowId', () => {
  it('accepts an id at exactly the limit', () => {
    const id = 'a'.repeat(MAX_ROW_ID_LENGTH);
    expect(assertRowId(id)).toBe(id);
  });

  it('rejects an id one character over', () => {
    expect(() => assertRowId('a'.repeat(MAX_ROW_ID_LENGTH + 1))).toThrow(/exceeds the 36-char/);
  });

  it('rejects an empty id', () => {
    expect(() => assertRowId('')).toThrow(/empty/);
  });

  it('rejects characters outside the allowed row-id set', () => {
    expect(() => assertRowId('has space')).toThrow(/only a-z/);
    expect(() => assertRowId('has:colon')).toThrow(/only a-z/);
    expect(() => assertRowId('_leading')).toThrow(/only a-z/);
  });
});

describe('pad', () => {
  it('zero-pads so ids sort lexically in numeric order', () => {
    expect(pad(4, 2)).toBe('04');
    expect(pad(14, 2)).toBe('14');
    expect(['04', '14'].sort()).toEqual(['04', '14']);
    expect(['4', '14'].sort()).toEqual(['14', '4']); // why padding is needed
  });

  it('leaves values wider than the pad alone', () => {
    expect(pad(123, 2)).toBe('123');
  });
});

describe('teamId', () => {
  it('composes league and roster', () => {
    expect(teamId(LEAGUE, 1)).toBe('1390575664880418816_01');
    expect(teamId(LEAGUE, 14)).toBe('1390575664880418816_14');
  });

  it('stays within the limit', () => {
    expect(teamId(LEAGUE, 14).length).toBeLessThanOrEqual(MAX_ROW_ID_LENGTH);
  });
});

describe('matchupRowId', () => {
  it('composes league, week and roster', () => {
    expect(matchupRowId(LEAGUE, 4, 1)).toBe('1390575664880418816_04_01');
  });

  it('stays within the limit for the widest realistic values', () => {
    const id = matchupRowId(LEAGUE, 18, 14);
    expect(id).toBe('1390575664880418816_18_14');
    expect(id.length).toBeLessThanOrEqual(MAX_ROW_ID_LENGTH);
  });
});

describe('playerScoreId', () => {
  it('composes league, week, roster and player', () => {
    expect(playerScoreId(LEAGUE, 4, 1, '4046')).toBe('1390575664880418816_04_01_4046');
  });

  it('allows a player id of exactly 10 characters and rejects an 11th', () => {
    expect(playerScoreId(LEAGUE, 18, 14, '1234567890').length).toBe(MAX_ROW_ID_LENGTH);
    expect(() => playerScoreId(LEAGUE, 18, 14, '12345678901')).toThrow(/exceeds the 36-char/);
  });

  it('keeps team defence abbreviations intact', () => {
    expect(playerScoreId(LEAGUE, 4, 1, 'DAL')).toBe('1390575664880418816_04_01_DAL');
  });
});

describe('bracketSlotId', () => {
  it('composes league, bracket and zero-padded game', () => {
    expect(bracketSlotId(LEAGUE, 'winners', 1)).toBe('1390575664880418816_winners_01');
    expect(bracketSlotId(LEAGUE, 'losers', 12)).toBe('1390575664880418816_losers_12');
  });

  it('stays within the limit for the longer bracket name', () => {
    expect(bracketSlotId(LEAGUE, 'winners', 12).length).toBeLessThanOrEqual(MAX_ROW_ID_LENGTH);
  });

  it('keeps the two brackets apart for the same game number', () => {
    expect(bracketSlotId(LEAGUE, 'winners', 1)).not.toBe(bracketSlotId(LEAGUE, 'losers', 1));
  });
});

describe('draftPickId', () => {
  it('composes draft id and a four-digit pick number', () => {
    expect(draftPickId(LEAGUE, 1)).toBe('1390575664880418816_0001');
    expect(draftPickId(LEAGUE, 196)).toBe('1390575664880418816_0196');
    expect(draftPickId(LEAGUE, 210)).toBe('1390575664880418816_0210');
  });

  it('stays within the limit', () => {
    expect(draftPickId(LEAGUE, 9999).length).toBeLessThanOrEqual(MAX_ROW_ID_LENGTH);
  });

  it('sorts lexically in pick order', () => {
    const ids = [draftPickId(LEAGUE, 10), draftPickId(LEAGUE, 2), draftPickId(LEAGUE, 100)];
    expect([...ids].sort()).toEqual([
      draftPickId(LEAGUE, 2),
      draftPickId(LEAGUE, 10),
      draftPickId(LEAGUE, 100),
    ]);
  });
});

describe('weekRowId', () => {
  it('zero-pads the week so rows sort in week order', () => {
    expect(weekRowId(LEAGUE, 4)).toBe('1390575664880418816_04');
  });
});

describe('dashboardId', () => {
  it('fits the longest view name', () => {
    expect(dashboardId(LEAGUE, 'playoffs')).toBe('1390575664880418816_playoffs');
  });
});
