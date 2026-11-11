import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { CurrentDashboard, CurrentTeam } from '@fantasy-football/core';
import type { Dashboards } from '../data/loadSeason';
import { DEF } from '../definitions';
import { FieldGoal } from '../FieldGoal';
import { count, NA, pct, pctTone, pts, signed } from '../format';
import { Bars, Card, HeroFootball, MetricHead, StatCard, Tabs, WeekPicker, names } from '../ui';
import { finalizedWeeks, leaders, PositionChip, recordWithPct, TeamLink, teamNames, type TeamNames } from './shared';

type SortKey = 'standings' | 'points' | 'odds';
const SORTS = [
  { key: 'standings', label: 'Standings order' },
  { key: 'points', label: 'Most points' },
  { key: 'odds', label: 'Playoff odds' },
] as const;

const byKey: Record<SortKey, (a: CurrentTeam, b: CurrentTeam) => number> = {
  standings: (a, b) => a.rank - b.rank,
  points: (a, b) => b.points_for - a.points_for || a.rank - b.rank,
  odds: (a, b) => (b.playoff_chance_pct ?? -1) - (a.playoff_chance_pct ?? -1) || a.rank - b.rank,
};

export function CurrentPage({ data }: { data: Dashboards }) {
  const { current, summary } = data;
  const name = teamNames(current);
  const { as_of } = current;
  const week = summary.week;

  const r = current.records;
  const high = r.highest_score;
  const low = r.lowest_score;
  const margin = r.largest_margin;
  const game = (h: { roster_id: number; opponent_roster_id: number | null; week: number }, vs: string) =>
    h.opponent_roster_id === null
      ? `${name(h.roster_id)}, week ${h.week}`
      : `${name(h.roster_id)} ${vs} ${name(h.opponent_roster_id)}, week ${h.week}`;
  const hot = leaders(current.teams, (t) => (t.streak?.result === 'W' ? t.streak.length : null));

  return (
    <>
      <Card i={0} className="panel hero">
        <div>
          <h1>{week === null ? 'Kickoff is coming!' : `Week ${week} is in the books!`}</h1>
          <p className="hero-status">
            {as_of.season_complete
              ? `The ${as_of.season} season is complete.`
              : as_of.current_week === 0
                ? 'The season hasn’t started yet.'
                : as_of.current_week > as_of.regular_season_weeks
                  ? `Playoffs · week ${as_of.current_week} underway.`
                  : `Week ${as_of.current_week} underway · regular season ends week ${as_of.regular_season_weeks}.`}
          </p>
        </div>
        <HeroFootball />
      </Card>

      <div className="stat-row">
        <StatCard i={1} butter label="Season high score" value={high[0]?.value ?? null} format={pts} tone="ink"
          name={names(high.map((h) => `${name(h.roster_id)}, week ${h.week}`))} def={DEF.seasonHigh} />
        <StatCard i={2} label="Season low score" value={low[0]?.value ?? null} format={pts} tone="red"
          name={names(low.map((h) => `${name(h.roster_id)}, week ${h.week}`))} def={DEF.seasonLow} />
        <StatCard i={3} label="Hottest streak" value={hot[0]?.streak?.length ?? null}
          format={(v) => (v === null ? NA : `W${count(v)}`)} name={names(hot.map((t) => t.team_name))}
          tone="blue" def={DEF.hottestStreak} />
        <StatCard i={4} label="Biggest win" value={margin[0]?.value ?? null} format={pts} tone="brown"
          name={names(margin.map((h) => game(h, 'over')))} def={DEF.largestMargin} />
        <StatCard i={5} label="Narrowest victory" value={r.narrowest_victory[0]?.value ?? null} format={pts}
          tone="blue" name={names(r.narrowest_victory.map((h) => game(h, 'over')))} def={DEF.narrowestWin} />
        <StatCard i={6} label="Highest-scoring loss" value={r.highest_scoring_loss[0]?.value ?? null} format={pts}
          tone="ink" name={names(r.highest_scoring_loss.map((h) => game(h, 'lost to')))} def={DEF.highestLoss} />
      </div>

      <Standings teams={current.teams} medianGames={as_of.median_games} />
      <SeasonCharts teams={current.teams} />
      <WeekByWeek current={current} name={name} />

      <Card i={8} className="panel" aria-labelledby="fg-h">
        <h2 id="fg-h">Kick one through</h2>
        <FieldGoal />
      </Card>
    </>
  );
}

function Standings({ teams, medianGames }: { teams: CurrentTeam[]; medianGames: boolean }) {
  const [sort, setSort] = useState<SortKey>('standings');
  const rows = useMemo(() => [...teams].sort(byKey[sort]), [teams, sort]);
  return (
    <Card i={1} className="panel" aria-labelledby="standings-h">
      <div className="panel-head">
        <h2 id="standings-h">Standings</h2>
        <Tabs label="Sort the standings" options={SORTS} value={sort} onChange={setSort} />
      </div>
      <div className="table-box">
        <table className="table standings">
          <caption className="sr-only">
            Standings, sorted by {SORTS.find((s) => s.key === sort)!.label.toLowerCase()}. Select a team for details.
          </caption>
          <thead>
            <tr>
              <th scope="col">#</th>
              <th scope="col">Team</th>
              <th scope="col">Record</th>
              <th scope="col">Streak</th>
              <th scope="col" className="num">PF</th>
              <th scope="col" className="num">PA</th>
              <th scope="col" className="num">PF − PA</th>
              <th scope="col" className="num">Max PF</th>
              <th scope="col">Playoff odds</th>
              <th scope="col">Position</th>
              <th scope="col" className="num">Crowns</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((t, n) => (
              <motion.tr
                key={t.roster_id}
                layout="position"
                initial={{ opacity: 0, y: 16 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{
                  layout: { type: 'spring', stiffness: 420, damping: 34 },
                  default: { duration: 0.5, delay: n * 0.045, ease: [0.2, 0.9, 0.3, 1] },
                }}
              >
                <td className="rank">{t.rank_tied ? `T${t.rank}` : t.rank}</td>
                <th scope="row">
                  <TeamLink id={t.roster_id} name={t.team_name} />
                  <span className="manager">{t.manager_name}</span>
                  {t.lowest_pf && <span className="flag">Lowest PF</span>}
                </th>
                <td className="nowrap">{recordWithPct(t)}</td>
                <td>
                  <StreakChip streak={t.streak} />
                </td>
                <td className="num">{pts(t.points_for)}</td>
                <td className="num">{pts(t.points_against)}</td>
                <td className="num">{signed(t.point_difference)}</td>
                <td className="num">{pts(t.max_pf)}</td>
                <td>
                  <OddsBar value={t.playoff_chance_pct} />
                </td>
                <td>
                  <PositionChip position={t.position_now} />
                </td>
                <td className="num">{count(t.weekly_crowns)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="glossary">
        {(
          [
            ['Record', medianGames ? DEF.recordMedian : DEF.record],
            ['Streak', DEF.streak],
            ['PF', DEF.pointsFor],
            ['PA', DEF.pointsAgainst],
            ['PF − PA', DEF.pointDiff],
            ['Max PF', DEF.maxPf],
            ['Playoff odds', DEF.playoffPct],
            ['Position', DEF.position],
            ['Crowns', DEF.crowns],
          ] as const
        ).map(([term, def]) => (
          <div key={term}>
            <dt>{term}</dt>
            <dd>{def}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

export function StreakChip({ streak }: { streak: CurrentTeam['streak'] }) {
  if (!streak) return <span className="streak">{NA}</span>;
  const word = streak.result === 'W' ? 'win' : streak.result === 'L' ? 'loss' : 'tie';
  return (
    <span className={`streak streak-${streak.result.toLowerCase()}`}>
      {streak.result}
      {streak.length}
      <span className="sr-only">
        {' '}
        ({streak.length} {word}
        {streak.length === 1 ? '' : streak.result === 'L' ? 'es' : 's'} in a row)
      </span>
    </span>
  );
}

export function OddsBar({ value }: { value: number | null }) {
  return (
    <span className="odds">
      <span className="bar-track small">
        {value !== null && (
          <span className={`bar-fill fill-${pctTone(value)}`} style={{ '--w': value / 100 } as React.CSSProperties} />
        )}
      </span>
      <span className="odds-value">{pct(value)}</span>
    </span>
  );
}

function SeasonCharts({ teams }: { teams: CurrentTeam[] }) {
  const sorted = (value: (t: CurrentTeam) => number | null, asc = false) =>
    [...teams].sort((a, b) => {
      const x = value(a);
      const y = value(b);
      if (x === null) return 1;
      if (y === null) return -1;
      return asc ? x - y : y - x;
    });
  const maxSwing = Math.max(1, ...teams.map((t) => t.consistency ?? 0));
  const maxLuck = Math.max(1, ...teams.map((t) => Math.abs(t.schedule_luck ?? 0)));

  return (
    <div className="two-col">
      <Card i={2} className="panel">
        <MetricHead title="Lineup efficiency" def={DEF.efficiency} />
        <Bars
          label="Lineup efficiency: points scored as a share of Max PF"
          max={100}
          format={pct}
          data={sorted((t) => t.lineup_efficiency).map((t) => ({
            key: t.roster_id,
            label: t.team_name,
            value: t.lineup_efficiency,
            tone: pctTone(t.lineup_efficiency),
            note: t.max_pf === null ? 'no Max PF' : `${pts(t.points_for)} of ${pts(t.max_pf)}`,
          }))}
        />
      </Card>
      <Card i={3} className="panel">
        <MetricHead title="How much of the league you’d beat" def={DEF.allPlay} />
        <Bars
          label="All-play percentage"
          max={100}
          format={pct}
          data={sorted((t) => t.all_play_pct).map((t) => ({
            key: t.roster_id,
            label: t.team_name,
            value: t.all_play_pct,
            tone: pctTone(t.all_play_pct),
          }))}
        />
      </Card>
      <Card i={4} className="panel">
        <MetricHead title="Schedule luck (in wins)" def={DEF.luck} />
        <Bars
          diverging
          label="Schedule luck in wins"
          max={maxLuck}
          format={signed}
          data={sorted((t) => t.schedule_luck).map((t) => ({
            key: t.roster_id,
            label: t.team_name,
            value: t.schedule_luck,
            tone: t.schedule_luck === null ? 'none' : t.schedule_luck >= 0 ? 'blue' : 'red',
          }))}
        />
      </Card>
      <Card i={5} className="panel">
        <MetricHead title="Boom or bust: typical swing from your average" def={DEF.consistency} />
        <Bars
          label="Typical weekly swing in points"
          max={maxSwing}
          format={pts}
          data={sorted((t) => t.consistency, true).map((t) => ({
            key: t.roster_id,
            label: t.team_name,
            value: t.consistency,
            tone: 'brown',
          }))}
        />
      </Card>
    </div>
  );
}

function WeekByWeek({ current, name }: { current: CurrentDashboard; name: TeamNames }) {
  const weeks = finalizedWeeks(current.as_of.finalized_through_week);
  const [week, setWeek] = useState(weeks.at(-1) ?? 1);
  const cells = current.weeks.filter((c) => c.week === week);
  // One line per game: the side with the lower roster ID leads, so each game shows once.
  const games = cells.filter((c) => c.opponent_roster_id === null || c.roster_id < c.opponent_roster_id);
  const cell = (id: number | null) => cells.find((c) => c.roster_id === id);

  return (
    <Card i={3} className="panel" aria-labelledby="weekly-h">
      <div className="panel-head">
        <h2 id="weekly-h">Week by week</h2>
        {weeks.length > 0 && <WeekPicker weeks={weeks} value={week} onChange={setWeek} />}
      </div>
      {weeks.length === 0 ? (
        <p>No week has finished yet.</p>
      ) : (
        <>
          <ul className="games">
            {games.map((a, n) => {
              const b = cell(a.opponent_roster_id);
              return (
                <li key={a.roster_id} className="game row-in" style={{ '--i': n } as React.CSSProperties}>
                  <GameSide id={a.roster_id} name={name(a.roster_id)} c={a} />
                  <span className="vs" aria-hidden="true">vs</span>
                  {b ? <GameSide id={b.roster_id} name={name(b.roster_id)} c={b} /> : <span>Bye</span>}
                </li>
              );
            })}
          </ul>
          <dl className="glossary">
            <div><dt>All-play</dt><dd>{DEF.weekAllPlay}</dd></div>
            <div><dt>Bench</dt><dd>{DEF.benchGap}</dd></div>
            <div><dt>👑 / 🥄</dt><dd>Week’s high score / week’s low score.</dd></div>
          </dl>
        </>
      )}
    </Card>
  );
}

function GameSide({ id, name, c }: { id: number; name: string; c: CurrentDashboard['weeks'][number] }) {
  return (
    <span className={`side ${c.result === 'W' ? 'won' : ''}`}>
      <TeamLink id={id} name={name} />
      <span className="side-score">
        {pts(c.points)} {c.result === 'W' && <span className="sr-only">(won)</span>}
        {c.weekly_crown && <span title="Week’s high score"> 👑<span className="sr-only">week’s high score</span></span>}
        {c.weekly_last && <span title="Week’s low score"> 🥄<span className="sr-only">week’s low score</span></span>}
      </span>
      <span className="side-meta">
        All-play {pct(c.all_play_pct)} · Bench {pts(c.bench_gap)}
      </span>
    </span>
  );
}
