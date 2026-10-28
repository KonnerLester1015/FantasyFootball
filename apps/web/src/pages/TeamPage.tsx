import type { CSSProperties } from 'react';
import type { Dashboards } from '../data/loadSeason';
import { DEF } from '../definitions';
import { count, pct, pctTone, pts, signed } from '../format';
import { Bars, Bubble, Card, CountUp } from '../ui';
import { useLeagueHref } from '../league-context';
import { OddsBar } from './CurrentPage';
import { PositionChip, TeamLink, teamNames } from './shared';

export function TeamPage({ data, rosterId }: { data: Dashboards; rosterId: number }) {
  const { current, playoffs } = data;
  const team = current.teams.find((t) => t.roster_id === rosterId);
  const name = teamNames(current);
  const home = useLeagueHref('/');
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

  const metrics: { label: string; value: string; def: string }[] = [
    { label: 'Record', value: team.record, def: DEF.record },
    { label: 'Win %', value: pct(team.win_pct), def: DEF.winPct },
    { label: 'Points For', value: pts(team.points_for), def: DEF.pointsFor },
    { label: 'Points Against', value: pts(team.points_against), def: DEF.pointsAgainst },
    { label: 'PF − PA', value: signed(team.point_difference), def: DEF.pointDiff },
    { label: 'Best possible lineup (Max PF)', value: pts(team.max_pf_calculated), def: DEF.maxPf },
    { label: 'Points left on bench', value: pts(team.points_left_on_bench), def: DEF.benchPoints },
    { label: 'Lineup efficiency', value: pct(team.efficiency), def: DEF.efficiency },
    { label: 'All-play %', value: pct(team.all_play_pct), def: DEF.allPlay },
    { label: 'Schedule luck', value: signed(team.schedule_luck), def: DEF.luck },
    { label: 'Weekly swings', value: pts(team.consistency), def: DEF.consistency },
    { label: 'Weekly crowns', value: count(team.weekly_crowns), def: DEF.crowns },
    { label: 'Last-place weeks', value: count(team.last_place_weeks), def: DEF.lastPlace },
    { label: 'Weeks over 150', value: count(team.weeks_over_150), def: DEF.over150 },
    { label: 'Weeks over 200', value: count(team.weeks_over_200), def: DEF.over200 },
    { label: 'Highest-scoring loss', value: pts(team.highest_scoring_loss), def: DEF.highestLoss },
    { label: 'Points in losses', value: pts(team.points_in_losses), def: DEF.pointsInLosses },
    { label: 'Adds', value: count(team.add_transactions), def: DEF.adds },
  ];

  return (
    <>
      <p><a className="back" href={home}>← All teams</a></p>
      <Card i={0} className="panel team-hero">
        <div>
          <h1>{team.team_name}</h1>
          <p className="hero-status">
            {team.manager_name} · {team.rank_tied ? 'T' : ''}#{team.rank} · {team.record}
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
                    <td>{w.result === 'W' ? 'Win' : w.result === 'L' ? 'Loss' : w.result === 'T' ? 'Tie' : 'Pending'}</td>
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
