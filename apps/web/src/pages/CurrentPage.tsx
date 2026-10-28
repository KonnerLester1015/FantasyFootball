import { useMemo, useState } from 'react';
import { motion } from 'motion/react';
import type { CurrentDashboard, CurrentTeam } from '@fantasy-football/core';
import type { Dashboards } from '../data/loadSeason';
import { DEF } from '../definitions';
import { FieldGoal } from '../FieldGoal';
import { count, NA, pct, pctTone, pts, signed } from '../format';
import { Bars, Bubble, Card, HeroFootball, MetricHead, StatCard, Tabs, WeekPicker, names } from '../ui';
import { finalizedWeeks, leaders, PositionChip, TeamLink, teamNames, type TeamNames } from './shared';

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

  const pfLeaders = leaders(current.teams, (t) => t.points_for);
  const margin = current.records.largest_margin;

  return (
    <>
      <Card i={0} className="panel hero">
        <div>
          <h1>{week === null ? 'Kickoff is coming!' : `Week ${week} is in the books!`}</h1>
          <p className="hero-status">
            {as_of.season_complete
              ? `The ${as_of.season} season is complete.`
              : `Week ${as_of.current_week} in progress · regular season ends week ${as_of.regular_season_weeks}.`}
          </p>
        </div>
        <HeroFootball />
      </Card>

      <div className="stat-row">
        <StatCard
          i={1}
          label="Most points so far"
          value={pfLeaders[0]?.points_for ?? null}
          format={pts}
          name={names(pfLeaders.map((t) => t.team_name))}
          tone="blue"
          def={DEF.pointsFor}
        />
        <StatCard
          i={2}
          butter
          label={week === null ? 'High score' : `High score · week ${week}`}
          value={summary.cards.high_score[0]?.points ?? null}
          format={pts}
          name={names(summary.cards.high_score.map((h) => name(h.roster_id)))}
          tone="ink"
          def={DEF.highScore}
        />
        <StatCard
          i={3}
          label="Biggest win"
          value={margin[0]?.value ?? null}
          format={pts}
          name={
            margin[0]
              ? `${name(margin[0].roster_id)} over ${name(margin[0].opponent_roster_id)}, week ${margin[0].week}`
              : NA
          }
          tone="brown"
          def={DEF.largestMargin}
        />
      </div>

      <Standings teams={current.teams} />
      <SeasonCharts teams={current.teams} />
      <WeekByWeek current={current} name={name} />
      <Trades current={current} name={name} playerNames={data.playerNames} />
      <SeasonRecords current={current} name={name} />

      <Card i={8} className="panel" aria-labelledby="fg-h">
        <h2 id="fg-h">Kick one through</h2>
        <FieldGoal />
      </Card>
    </>
  );
}

function Standings({ teams }: { teams: CurrentTeam[] }) {
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
              <th scope="col" className="num">Win %</th>
              <th scope="col" className="num">PF</th>
              <th scope="col" className="num">PA</th>
              <th scope="col" className="num">PF − PA</th>
              <th scope="col" className="num">Max PF</th>
              <th scope="col">Playoff odds</th>
              <th scope="col">Position</th>
              <th scope="col" className="num">Left</th>
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
                <td>{t.record}</td>
                <td className="num">{pct(t.win_pct)}</td>
                <td className="num">{pts(t.points_for)}</td>
                <td className="num">{pts(t.points_against)}</td>
                <td className="num">{signed(t.point_difference)}</td>
                <td className="num">{pts(t.max_pf_sleeper)}</td>
                <td>
                  <OddsBar value={t.playoff_chance_pct} />
                </td>
                <td>
                  <PositionChip position={t.position_now} />
                </td>
                <td className="num">{count(t.games_left)}</td>
                <td className="num">{count(t.weekly_crowns)}</td>
              </motion.tr>
            ))}
          </tbody>
        </table>
      </div>
      <dl className="glossary">
        {(
          [
            ['Record', DEF.record],
            ['Win %', DEF.winPct],
            ['PF', DEF.pointsFor],
            ['PA', DEF.pointsAgainst],
            ['PF − PA', DEF.pointDiff],
            ['Max PF', DEF.maxPf],
            ['Playoff odds', DEF.playoffPct],
            ['Position', DEF.position],
            ['Left', DEF.gamesLeft],
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
  const sorted = <K extends keyof CurrentTeam>(key: K, asc = false) =>
    [...teams].sort((a, b) => {
      const x = a[key] as number | null;
      const y = b[key] as number | null;
      if (x === null) return 1;
      if (y === null) return -1;
      return asc ? x - y : y - x;
    });
  const maxPf = Math.max(...teams.map((t) => t.max_pf_calculated ?? t.points_for));
  const maxSwing = Math.max(1, ...teams.map((t) => t.consistency ?? 0));
  const maxBench = Math.max(1, ...teams.map((t) => t.points_left_on_bench ?? 0));
  const maxLuck = Math.max(1, ...teams.map((t) => Math.abs(t.schedule_luck ?? 0)));

  return (
    <div className="two-col">
      <Card i={2} className="panel">
        <MetricHead title="Points scored vs best possible lineup" def={`${DEF.pointsFor} The thin line is the best possible lineup. ${DEF.maxPf}`} />
        <Bars
          label="Points For with best possible lineup"
          max={maxPf}
          format={pts}
          ghostFormat={pts}
          data={sorted('points_for').map((t) => ({
            key: t.roster_id,
            label: t.team_name,
            value: t.points_for,
            ghost: t.max_pf_calculated,
            tone: 'blue',
          }))}
        />
      </Card>
      <Card i={3} className="panel">
        <MetricHead title="How much of the league you’d beat" def={DEF.allPlay} />
        <Bars
          label="All-play percentage"
          max={100}
          format={pct}
          data={sorted('all_play_pct').map((t) => ({
            key: t.roster_id,
            label: t.team_name,
            value: t.all_play_pct,
            tone: pctTone(t.all_play_pct),
          }))}
        />
      </Card>
      <Card i={4} className="panel">
        <MetricHead title="Schedule luck" def={DEF.luck} />
        <Bars
          diverging
          label="Schedule luck in wins"
          max={maxLuck}
          format={signed}
          data={sorted('schedule_luck').map((t) => ({
            key: t.roster_id,
            label: t.team_name,
            value: t.schedule_luck,
            tone: t.schedule_luck === null ? 'none' : t.schedule_luck >= 0 ? 'blue' : 'red',
          }))}
        />
      </Card>
      <Card i={5} className="panel">
        <MetricHead title="Weekly scoring swings (lower = steadier)" def={DEF.consistency} />
        <Bars
          label="Consistency in points"
          max={maxSwing}
          format={pts}
          data={sorted('consistency', true).map((t) => ({
            key: t.roster_id,
            label: t.team_name,
            value: t.consistency,
            tone: 'brown',
          }))}
        />
      </Card>
      <Card i={6} className="panel">
        <MetricHead title="Points left on the bench" def={DEF.benchPoints} />
        <Bars
          label="Points left on the bench"
          max={maxBench}
          format={pts}
          data={sorted('points_left_on_bench').map((t) => ({
            key: t.roster_id,
            label: t.team_name,
            value: t.points_left_on_bench,
            tone: 'red',
          }))}
        />
      </Card>
      <Card i={7} className="panel">
        <MetricHead title="Lineup efficiency" def={DEF.efficiency} />
        <Bars
          label="Lineup efficiency"
          max={100}
          format={pct}
          data={sorted('efficiency').map((t) => ({
            key: t.roster_id,
            label: t.team_name,
            value: t.efficiency,
            tone: pctTone(t.efficiency),
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

function Trades({
  current,
  name,
  playerNames,
}: {
  current: CurrentDashboard;
  name: TeamNames;
  playerNames: Map<string, string>;
}) {
  const { recap, estimates } = current.trades;
  const player = (id: string) => playerNames.get(id) ?? `Player ${id}`;
  const byTrade = [...new Set(recap.map((r) => r.transaction_id))];
  if (byTrade.length === 0) return null;

  return (
    <Card i={7} className="panel" aria-labelledby="trades-h">
      <h2 id="trades-h">Trades</h2>
      <Bubble>
        Measured points are what the players you got actually scored for you since the trade. The edge compares the
        recent points per game of what each side received; it is an estimate, not a verdict.
      </Bubble>
      <div className="trade-list">
        {byTrade.map((id, n) => {
          const sides = recap.filter((r) => r.transaction_id === id);
          return (
            <Card key={id} i={n + 2} as="article" className="trade">
              <h3>Week {sides[0]!.week} trade</h3>
              {sides.map((s) => {
                const est = estimates.find((e) => e.transaction_id === id && e.roster_id === s.roster_id);
                return (
                  <div key={s.roster_id} className="trade-side">
                    <p><strong>{name(s.roster_id)}</strong> got {s.received.map(player).join(', ') || 'no players'}</p>
                    <p className="small">
                      Measured since: {pts(s.measured_points)} pts · Recent edge: {signed(est?.estimated_weekly_edge)} per week
                      {est && ` (${est.classification})`}
                    </p>
                  </div>
                );
              })}
            </Card>
          );
        })}
      </div>
    </Card>
  );
}

function SeasonRecords({ current, name }: { current: CurrentDashboard; name: TeamNames }) {
  const r = current.records;
  const items = [
    { title: 'Largest margin', def: DEF.largestMargin, rows: r.largest_margin, vs: 'over' },
    { title: 'Narrowest victory', def: DEF.narrowestWin, rows: r.narrowest_victory, vs: 'over' },
    { title: 'Highest-scoring loss', def: DEF.highestLoss, rows: r.highest_scoring_loss, vs: 'lost to' },
  ];
  return (
    <div className="stat-row">
      {items.map((it, n) => (
        <Card key={it.title} i={n + 1} as="article" className="stat">
          <h3 className="stat-label">{it.title}</h3>
          <p className="stat-number tone-ink">{pts(it.rows[0]?.value)}</p>
          <p className="stat-name">
            {it.rows.length === 0
              ? NA
              : it.rows.map((h) => `${name(h.roster_id)} ${it.vs} ${name(h.opponent_roster_id)} (wk ${h.week})`).join(' / ')}
          </p>
          <Bubble>{it.def}</Bubble>
        </Card>
      ))}
    </div>
  );
}
