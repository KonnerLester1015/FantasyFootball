import type { CSSProperties } from 'react';
import type { Dashboards } from '../data/loadSeason';
import { DEF } from '../definitions';
import { count, pct, pctTone, pts, signed } from '../format';
import { Bars, Bubble, Card, CountUp } from '../ui';
import { useLeagueHref } from '../league-context';
import { OddsBar, StreakChip } from './CurrentPage';
import { OddsExplainer, PositionChip, recordWithPct, ResultText, TeamLink, teamNames } from './shared';
import { TeamRoster } from './TeamRoster';

export function TeamPage({ data, rosterId }: { data: Dashboards; rosterId: number }) {
  const { current, playoffs } = data;
  const team = current.teams.find((t) => t.roster_id === rosterId);
  const name = teamNames(current);
  const home = useLeagueHref('/');
  const teamHref = useLeagueHref('/team/');
  if (!team) {
    return (
      <Card i={1} className="panel">
        <h2>No team with roster {rosterId}</h2>
        <a className="button" href={home}>Back to the standings</a>
      </Card>
    );
  }
  const forecast = playoffs.forecast.rows.find((r) => r.roster_id === rosterId);
  const scenarios = playoffs.forecast.scenarios.filter((s) => s.roster_id === rosterId);
  const cells = new Map(current.weeks.filter((c) => c.roster_id === rosterId).map((c) => [c.week, c]));
  const median = current.as_of.median_games;

  // Previous / next in standings order, wrapping around the ends.
  const order = current.teams;
  const at = order.findIndex((t) => t.roster_id === rosterId);
  const prev = order[(at - 1 + order.length) % order.length]!;
  const next = order[(at + 1) % order.length]!;

  const metrics: { label: string; value: string; def: string }[] = [
    { label: 'Record', value: recordWithPct(team), def: median ? DEF.recordMedian : DEF.record },
    { label: 'Points For', value: pts(team.points_for), def: DEF.pointsFor },
    { label: 'Points Against', value: pts(team.points_against), def: DEF.pointsAgainst },
    { label: 'PF − PA', value: signed(team.point_difference), def: DEF.pointDiff },
    { label: 'Max PF', value: pts(team.max_pf), def: DEF.maxPf },
    { label: 'Points left on bench', value: pts(team.bench_points), def: DEF.benchPoints },
    { label: 'Lineup efficiency', value: pct(team.lineup_efficiency), def: DEF.efficiency },
    { label: 'All-play %', value: pct(team.all_play_pct), def: DEF.allPlay },
    { label: 'Schedule luck', value: signed(team.schedule_luck), def: DEF.luck },
    { label: 'Typical weekly swing', value: pts(team.consistency), def: DEF.consistency },
    { label: 'Weekly crowns', value: count(team.weekly_crowns), def: DEF.crowns },
    { label: 'Last-place weeks', value: count(team.last_place_weeks), def: DEF.lastPlace },
    { label: 'Weeks over 150', value: count(team.weeks_over_150), def: DEF.over150 },
    { label: 'Weeks over 200', value: count(team.weeks_over_200), def: DEF.over200 },
    { label: 'Highest-scoring loss', value: pts(team.highest_scoring_loss), def: DEF.highestLoss },
  ];

  return (
    <>
      <nav className="team-nav" aria-label="Other teams">
        <a className="pill" href={`${teamHref}${prev.roster_id}`} rel="prev">
          <span aria-hidden="true">←</span> {prev.team_name}
        </a>
        <a className="pill" href={`${teamHref}${next.roster_id}`} rel="next">
          {next.team_name} <span aria-hidden="true">→</span>
        </a>
      </nav>
      <Card i={0} className="panel team-hero">
        <div>
          <h1>{team.team_name}</h1>
          <p className="hero-status">
            {team.manager_name} · {team.rank_tied ? 'T' : ''}#{team.rank} · {recordWithPct(team)} ·{' '}
            <StreakChip streak={team.streak} />
          </p>
          <PositionChip position={team.position_now} />
        </div>
        <div className="team-odds">
          <p className="stat-label">Playoff odds</p>
          <p className={`stat-number tone-${pctTone(team.playoff_chance_pct) === 'none' ? 'ink' : pctTone(team.playoff_chance_pct)}`}>
            <CountUp value={team.playoff_chance_pct} format={pct} />
          </p>
        </div>
      </Card>

      <TeamRoster current={current} rosterId={rosterId} i={1} />

      <Card i={1} className="panel" aria-labelledby="team-metrics">
        <h2 id="team-metrics">Season numbers</h2>
        <dl className="metric-grid">
          {metrics.map((m, n) => (
            <div key={m.label} className="metric row-in" style={{ '--i': n } as CSSProperties}>
              <dt>{m.label}</dt>
              <dd className="metric-value">{m.value}</dd>
              <dd className="metric-def">{m.def}</dd>
            </div>
          ))}
        </dl>
      </Card>

      <Card i={2} className="panel" aria-labelledby="team-weeks">
        <h2 id="team-weeks">Week by week</h2>
        <div className="table-box">
          <table className="table">
            <caption className="sr-only">{team.team_name} results by week</caption>
            <thead>
              <tr>
                <th scope="col">Week</th>
                <th scope="col">Opponent</th>
                <th scope="col" className="num">Score</th>
                <th scope="col" className="num">Opp.</th>
                <th scope="col" className="num">Margin</th>
                <th scope="col">Result</th>
                {median && <th scope="col">vs median</th>}
                <th scope="col" className="num">All-play</th>
                <th scope="col" className="num">Bench</th>
              </tr>
            </thead>
            <tbody>
              {team.weeks.map((w) => {
                const c = cells.get(w.week);
                return (
                  <tr key={w.week}>
                    <th scope="row">{w.week}</th>
                    <td>{w.opponent_roster_id === null ? 'Bye' : <TeamLink id={w.opponent_roster_id} name={name(w.opponent_roster_id)} />}</td>
                    <td className="num">{pts(w.points)}{c?.weekly_crown ? ' 👑' : ''}{c?.weekly_last ? ' 🥄' : ''}</td>
                    <td className="num">{pts(w.opponent_points)}</td>
                    <td className="num">{signed(w.margin)}</td>
                    <td><ResultText result={w.result} /></td>
                    {median && <td><ResultText result={c?.median_result} /></td>}
                    <td className="num">{pct(c?.all_play_pct)}</td>
                    <td className="num">{pts(c?.bench_gap)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="glossary">
          <div><dt>Margin</dt><dd>{DEF.margin}</dd></div>
          {median && <div><dt>vs median</dt><dd>{DEF.medianResult}</dd></div>}
          <div><dt>All-play</dt><dd>{DEF.weekAllPlay}</dd></div>
          <div><dt>Bench</dt><dd>{DEF.benchGap}</dd></div>
        </dl>
      </Card>

      <div className="two-col">
        <Card i={3} className="panel">
          <h2>Playoff path</h2>
          <Bubble>{DEF.playoffPct}</Bubble>
          <dl className="metric-grid small">
            <div className="metric"><dt>Odds</dt><dd className="metric-value"><OddsBar value={forecast?.playoff_chance_pct ?? null} /></dd></div>
            <div className="metric"><dt>Wins that clinch</dt><dd className="metric-value">{count(forecast?.guarantee_wins)}</dd><dd className="metric-def">{DEF.guaranteeWins}</dd></div>
            <div className="metric"><dt>Losses that eliminate</dt><dd className="metric-value">{count(forecast?.losses_to_eliminate)}</dd><dd className="metric-def">{DEF.lossesToEliminate}</dd></div>
            <div className="metric"><dt>Wins for 80% odds</dt><dd className="metric-value">{count(forecast?.lowest_wins_with_80pct_odds)}</dd><dd className="metric-def">{DEF.wins80}</dd></div>
          </dl>
          <OddsExplainer asOf={current.as_of} />
        </Card>
        <Card i={4} className="panel">
          <h2>If they finish…</h2>
          <Bubble>{DEF.scenario}</Bubble>
          <Bars
            label="Playoff chance by number of further wins"
            max={100}
            format={pct}
            data={scenarios.map((s) => ({
              key: s.additional_wins,
              label: `Goes ${s.additional_wins}-${s.additional_losses}`,
              value: s.conditional_playoff_chance_pct,
              tone: pctTone(s.conditional_playoff_chance_pct),
            }))}
          />
        </Card>
      </div>
    </>
  );
}
