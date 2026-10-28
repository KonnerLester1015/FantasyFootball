import { useState } from 'react';
import type { BracketGameView } from '@fantasy-football/core';
import type { Dashboards } from '../data/loadSeason';
import { DEF } from '../definitions';
import { count, pct, pctTone } from '../format';
import { Bars, Bubble, Card, MetricHead } from '../ui';
import { OddsBar } from './CurrentPage';
import { PositionChip, TeamLink, teamNames, type TeamNames } from './shared';

export function PlayoffsPage({ data }: { data: Dashboards }) {
  const { playoffs, current } = data;
  const name = teamNames(current);
  const rows = [...playoffs.forecast.rows].sort(
    (a, b) => (b.playoff_chance_pct ?? -1) - (a.playoff_chance_pct ?? -1),
  );
  const [picked, setPicked] = useState(rows[0]?.roster_id ?? 1);
  const scenarios = playoffs.forecast.scenarios.filter((s) => s.roster_id === picked);

  return (
    <>
      <Card i={0} className="panel hero">
        <div>
          <h1>Who’s getting in?</h1>
          <p className="hero-status">
            Top 6 make the playoffs (top 2 get a bye). Playoffs start week {current.as_of.regular_season_weeks + 1}.
          </p>
        </div>
      </Card>

      <div className="two-col">
        <Card i={1} className="panel">
          <MetricHead title="Playoff odds" def={DEF.playoffPct} />
          <Bars
            label="Playoff odds by team"
            max={100}
            format={pct}
            data={rows.map((r) => ({
              key: r.roster_id,
              label: name(r.roster_id),
              value: r.playoff_chance_pct,
              tone: pctTone(r.playoff_chance_pct),
            }))}
          />
          <Bubble>{playoffs.forecast.note}</Bubble>
        </Card>

        <Card i={2} className="panel">
          <MetricHead title="If they finish…" def={DEF.scenario} />
          <label className="field">
            <span>Team</span>
            <select value={picked} onChange={(e) => setPicked(Number(e.target.value))}>
              {rows.map((r) => (
                <option key={r.roster_id} value={r.roster_id}>{name(r.roster_id)}</option>
              ))}
            </select>
          </label>
          <Bars
            label={`Playoff chance for ${name(picked)} by further wins`}
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

      <Card i={3} className="panel" aria-labelledby="outlook-h">
        <h2 id="outlook-h">Playoff outlook</h2>
        <div className="table-box">
          <table className="table">
            <caption className="sr-only">Playoff odds and win/loss bounds per team</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col">Record</th>
                <th scope="col" className="num">Left</th>
                <th scope="col">Odds</th>
                <th scope="col">Now</th>
                <th scope="col" className="num">Wins to clinch</th>
                <th scope="col" className="num">Losses to elim.</th>
                <th scope="col" className="num">Wins for 80%</th>
                <th scope="col" className="num">Cutoff wins</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.roster_id}>
                  <th scope="row"><TeamLink id={r.roster_id} name={name(r.roster_id)} /></th>
                  <td>{r.record}</td>
                  <td className="num">{count(r.remaining_games)}</td>
                  <td><OddsBar value={r.playoff_chance_pct} /></td>
                  <td><PositionChip position={r.position_now} /></td>
                  <td className="num">{count(r.guarantee_wins)}</td>
                  <td className="num">{count(r.losses_to_eliminate)}</td>
                  <td className="num">{count(r.lowest_wins_with_80pct_odds)}</td>
                  <td className="num">{count(r.median_cutoff_wins)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <dl className="glossary">
          <div><dt>Wins to clinch</dt><dd>{DEF.guaranteeWins}</dd></div>
          <div><dt>Losses to elim.</dt><dd>{DEF.lossesToEliminate}</dd></div>
          <div><dt>Wins for 80%</dt><dd>{DEF.wins80}</dd></div>
          <div><dt>Cutoff wins</dt><dd>{DEF.medianCutoff}</dd></div>
        </dl>
      </Card>

      <Bracket title="Championship bracket" games={playoffs.brackets.winners} name={name} i={4} />
      <Bracket title="Consolation bracket" games={playoffs.brackets.losers} name={name} i={5} />
    </>
  );
}

function Bracket({ title, games, name, i }: { title: string; games: BracketGameView[]; name: TeamNames; i: number }) {
  const rounds = [...new Set(games.map((g) => g.round))].sort((a, b) => a - b);
  return (
    <Card i={i} className="panel" aria-label={title}>
      <h2>{title}</h2>
      {games.length === 0 ? (
        <Bubble>The bracket appears here once Sleeper publishes it after the regular season.</Bubble>
      ) : (
        <div className="bracket">
          {rounds.map((round) => (
            <div key={round} className="bracket-round">
              <h3>Round {round}</h3>
              {games
                .filter((g) => g.round === round)
                .sort((a, b) => a.game - b.game)
                .map((g, n) => (
                  <Card key={g.game} i={n + round} as="article" className="bracket-game">
                    <BracketTeam id={g.team1_roster_id} label={g.team1_label} winner={g.winner_roster_id} name={name} />
                    <BracketTeam id={g.team2_roster_id} label={g.team2_label} winner={g.winner_roster_id} name={name} />
                    {g.placement !== null && <p className="small">For place {g.placement}</p>}
                  </Card>
                ))}
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}

function BracketTeam({
  id,
  label,
  winner,
  name,
}: {
  id: number | null;
  label: string | null;
  winner: number | null;
  name: TeamNames;
}) {
  const won = id !== null && id === winner;
  return (
    <p className={`bracket-team ${won ? 'won' : ''}`}>
      {id !== null ? name(id) : (label ?? 'Bye')}
      {won && <span className="chip chip-in">Won</span>}
    </p>
  );
}
