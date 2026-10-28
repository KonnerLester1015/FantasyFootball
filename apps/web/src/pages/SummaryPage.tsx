import { useState, type CSSProperties } from 'react';
import type { Dashboards } from '../data/loadSeason';
import { DEF } from '../definitions';
import { NA, pct, pts, signed } from '../format';
import { Bars, Bubble, Card, MetricHead, StatCard, WeekPicker, names } from '../ui';
import { OddsBar } from './CurrentPage';
import { PositionLeaders } from './PositionLeaders';
import { finalizedWeeks, leaders, PositionChip, TeamLink, teamNames } from './shared';

export function SummaryPage({ data }: { data: Dashboards }) {
  const { summary, current } = data;
  const name = teamNames(current);
  const weeks = finalizedWeeks(current.as_of.finalized_through_week);
  const [week, setWeek] = useState(summary.week ?? weeks.at(-1) ?? 1);

  if (weeks.length === 0) {
    return (
      <Card i={0} className="panel">
        <h1>Weekly recap</h1>
        <p>The first recap appears once week 1 is final.</p>
      </Card>
    );
  }

  const latest = week === summary.week;
  const cells = current.weeks.filter((c) => c.week === week);
  // Stored flags mark the week's high and low; the latest week uses the summary cards.
  const high = latest
    ? summary.cards.high_score
    : cells.filter((c) => c.weekly_crown).map((c) => ({ roster_id: c.roster_id, points: c.points }));
  const low = latest
    ? summary.cards.low_score
    : cells.filter((c) => c.weekly_last).map((c) => ({ roster_id: c.roster_id, points: c.points }));
  const blowout = leaders(cells, (c) => (c.result === 'W' ? c.margin : null));
  const nailBiter = leaders(cells, (c) => (c.result === 'W' ? c.margin : null), true);
  const ranked = [...cells].sort((a, b) => b.points - a.points);
  const maxPoints = Math.max(1, ...cells.map((c) => c.points));
  const summaryTeam = new Map(summary.teams.map((t) => [t.roster_id, t]));

  return (
    <div className="recap">
      <Card i={0} className="panel hero">
        <div>
          <h1>Week {week} recap</h1>
          <p className="hero-status">
            {latest ? 'The latest finished week.' : `A look back at week ${week}.`} Every number is final.
          </p>
        </div>
        <WeekPicker weeks={weeks} value={week} onChange={setWeek} />
      </Card>

      <div className="stat-row">
        <StatCard i={1} butter label="High score" value={high[0]?.points ?? null} format={pts} tone="ink"
          name={names(high.map((h) => name(h.roster_id)))} def={DEF.highScore} />
        <StatCard i={2} label="Low score" value={low[0]?.points ?? null} format={pts} tone="red"
          name={names(low.map((h) => name(h.roster_id)))} def={DEF.lowScore} />
        <StatCard i={3} label="Biggest win" value={blowout[0]?.margin ?? null} format={pts} tone="brown"
          name={blowout[0] ? `${name(blowout[0].roster_id)} over ${name(blowout[0].opponent_roster_id)}` : NA}
          def={DEF.margin} />
        <StatCard i={0} label="Closest win" value={nailBiter[0]?.margin ?? null} format={pts} tone="blue"
          name={nailBiter[0] ? `${name(nailBiter[0].roster_id)} over ${name(nailBiter[0].opponent_roster_id)}` : NA}
          def={DEF.margin} />
      </div>

      <PositionLeaders
        i={4}
        week={week}
        // Optional only because rows published before this field existed lack it.
        leaders={summary.position_leaders?.find((w) => w.week === week)}
        name={name}
      />

      {latest && summary.record_breaks.length > 0 && (
        <Card i={1} className="panel" aria-labelledby="breaks-h">
          <h2 id="breaks-h">Records broken this week</h2>
          <ul className="breaks">
            {summary.record_breaks.map((r, n) => (
              <li key={r.$id} className="row-in" style={{ '--i': n } as CSSProperties}>
                <strong>{r.record_label}:</strong> {pts(r.value)} · {r.holder_names.join(' / ')}
                {r.predecessor_value !== null && (
                  <span className="previous"> · old mark {pts(r.predecessor_value)}, {r.predecessor_names.join(' / ')}</span>
                )}
              </li>
            ))}
          </ul>
        </Card>
      )}

      <Card i={2} className="panel">
        <MetricHead title={`Week ${week} scores`} def={DEF.highScore} />
        <Bars
          label={`Scores in week ${week}`}
          max={maxPoints}
          format={pts}
          data={ranked.map((c) => ({
            key: c.roster_id,
            label: `${name(c.roster_id)}${c.weekly_crown ? ' 👑' : ''}${c.weekly_last ? ' 🥄' : ''}`,
            value: c.points,
            tone: 'blue',
          }))}
        />
      </Card>

      <Card i={3} className="panel" aria-labelledby="recap-table-h">
        <h2 id="recap-table-h">Team by team</h2>
        <div className="table-box">
          <table className="table">
            <caption className="sr-only">Week {week} per team, with season context for the latest week</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                <th scope="col" className="num">Score</th>
                <th scope="col">Result</th>
                <th scope="col" className="num">Margin</th>
                <th scope="col" className="num">Week all-play</th>
                <th scope="col" className="num">Bench</th>
                {latest && <th scope="col" className="num">Season all-play</th>}
                {latest && <th scope="col" className="num">Season luck</th>}
                {latest && <th scope="col">Playoff odds</th>}
                {latest && <th scope="col">Now</th>}
              </tr>
            </thead>
            <tbody>
              {ranked.map((c) => {
                const s = summaryTeam.get(c.roster_id);
                return (
                  <tr key={c.roster_id}>
                    <th scope="row"><TeamLink id={c.roster_id} name={name(c.roster_id)} /></th>
                    <td className="num">{pts(c.points)}</td>
                    <td>{c.result === 'W' ? 'Win' : c.result === 'L' ? 'Loss' : c.result === 'T' ? 'Tie' : 'Pending'}</td>
                    <td className="num">{signed(c.margin)}</td>
                    <td className="num">{pct(c.all_play_pct)}</td>
                    <td className="num">{pts(c.bench_gap)}</td>
                    {latest && <td className="num">{pct(s?.season_all_play_pct)}</td>}
                    {latest && <td className="num">{signed(s?.season_schedule_luck)}</td>}
                    {latest && <td><OddsBar value={s?.playoff_chance_pct ?? null} /></td>}
                    {latest && <td>{s ? <PositionChip position={s.position_now} /> : NA}</td>}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <dl className="glossary">
          <div><dt>Margin</dt><dd>{DEF.margin}</dd></div>
          <div><dt>Week all-play</dt><dd>{DEF.weekAllPlay}</dd></div>
          <div><dt>Bench</dt><dd>{DEF.benchGap}</dd></div>
          {latest && <div><dt>Season all-play</dt><dd>{DEF.allPlay}</dd></div>}
          {latest && <div><dt>Season luck</dt><dd>{DEF.luck}</dd></div>}
          {latest && <div><dt>Playoff odds</dt><dd>{DEF.playoffPct}</dd></div>}
        </dl>
      </Card>
      {!latest && <Bubble>Season columns (luck, playoff odds) show on the latest week only, because they describe the season so far.</Bubble>}
    </div>
  );
}
