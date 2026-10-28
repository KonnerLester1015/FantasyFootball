import { describe, expect, it } from 'vitest';
import { trimPlayerDictionary } from './players';

describe('trimPlayerDictionary', () => {
  it('keeps the fields the app needs and drops the rest', () => {
    const trimmed = trimPlayerDictionary({
      '100': {
        full_name: 'A Player',
        position: 'QB',
        fantasy_positions: ['QB'],
        team: 'KC',
        status: 'Active',
        age: 28,
        // @ts-expect-error extra upstream field that must not survive trimming
        search_rank: 12,
      },
    });

    expect(Object.keys(trimmed['100'] ?? {}).sort()).toEqual([
      'age',
      'fantasy_positions',
      'full_name',
      'position',
      'status',
      'team',
    ]);
  });

  it('keeps every player, so a roster change between fetches still resolves', () => {
    const trimmed = trimPlayerDictionary({ a: { position: 'QB' }, b: { position: 'RB' } });
    expect(Object.keys(trimmed)).toEqual(['a', 'b']);
  });
});
