import type { RecordBookEntry } from '@fantasy-football/core';
import type { Dashboards } from '../data/loadSeason';
import { DEF } from '../definitions';
import { count, NA, pts } from '../format';
import { Bubble, Card } from '../ui';

// Record values that are counts, not points.
const COUNT_RECORDS = new Set(['crowns', 'over_150', 'over_200', 'last_week']);

const RECORD_DEFS: Record<string, string> = {
  hi_week: 'The most points any team has scored in one week.',
  lo_week: 'The fewest points any team has scored in one finished week.',
  crowns: DEF.crowns,
  over_150: DEF.over150,
  over_200: DEF.over200,
  last_week: DEF.lastPlace,
  narrow_win: DEF.narrowestWin,
};

/** This season's record book. Prior seasons are not fetched. */
export function HistoryPage({ data }: { data: Dashboards }) {
  const { history } = data;
  const through = history.as_of.finalized_through_week;

  return (
    <>
      <Card i={0} className="panel hero">
        <div>
          <h1>The Record Book</h1>
          <p className="hero-status">
            {through >= 1
              ? `Every mark set in the ${history.as_of.season} season, through week ${through}.`
              : `No ${history.as_of.season} weeks scored yet.`}
          </p>
        </div>
      </Card>
      <Bubble>{DEF.recordBook}</Bubble>

      <div className="trophy-grid">
        {history.record_book.map((r, n) => (
          <Trophy key={r.record_code} entry={r} i={n} />
        ))}
      </div>
    </>
  );
}

function Trophy({ entry, i }: { entry: RecordBookEntry; i: number }) {
  const fmt = COUNT_RECORDS.has(entry.record_code) ? count : pts;
  const last = entry.previous.at(-1);
  const where = (h: RecordBookEntry['holders'][number]) =>
    [h.team_name, `wk ${h.week}`, h.opponent_team_name && `vs ${h.opponent_team_name}`]
      .filter(Boolean)
      .join(', ');
  return (
    <Card i={i} as="article" className="trophy">
      <svg className="trophy-icon" viewBox="0 0 48 48" aria-hidden="true">
        <path
          d="M14 6h20v10a10 10 0 0 1-20 0zM14 9H7c0 7 3 10 8 11M34 9h7c0 7-3 10-8 11M20 26h8v8h-8zM15 42h18v-8H15z"
          fill="var(--yellow)"
          stroke="var(--ink)"
          strokeWidth="3"
          strokeLinejoin="round"
        />
      </svg>
      <h3>{entry.record_label}</h3>
      <p className="trophy-value">{entry.value === null ? NA : fmt(entry.value)}</p>
      <p className="trophy-holder">
        {entry.holders.length > 0 ? entry.holders.map(where).join(' / ') : 'Not set yet'}
      </p>
      {last && (
        <p className="previous">
          Previous holder: {last.holders.map((h) => h.team_name).join(' / ')} ({fmt(last.value)}),
          broken week {last.broken_in_week}
        </p>
      )}
      <p className="small">{RECORD_DEFS[entry.record_code] ?? ''}</p>
    </Card>
  );
}
