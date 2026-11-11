// "Standings, week by week": a bump chart of every team's rank after each
// week (packages/core rankHistory). Fourteen lines can't each carry a hue a
// reader can tell apart, so every line rests in muted ink with its team named
// at the right end; hovering previews a team and clicking pins up to three, each
// in its own validated color (blue / orange / purple). Geometry only here.

import { useMemo, useRef, useState, type CSSProperties } from 'react';
import type { CurrentDashboard, WeeklyRank } from '@fantasy-football/core';
import { pts } from '../format';
import { Bubble, Card } from '../ui';
import type { TeamNames } from './shared';

const PICKS = ['var(--pick-1)', 'var(--pick-2)', 'var(--pick-3)'] as const;
const MAX_PICKS = PICKS.length;

const W = 900;
const LEFT = 48;
const RIGHT = 196;
const TOP = 18;
const ROW = 34;
const BOTTOM = 40;

const short = (name: string): string => (name.length > 22 ? `${name.slice(0, 21)}…` : name);
const record = (r: WeeklyRank): string => `${r.wins}-${r.losses}-${r.ties}`;

export function StandingsRace({ current, name, i }: { current: CurrentDashboard; name: TeamNames; i: number }) {
  const history = current.rank_history;
  const weeks = useMemo(() => [...new Set(history.map((r) => r.week))].sort((a, b) => a - b), [history]);
  const teams = current.teams; // standings order, for the legend
  const n = teams.length;

  /** Pinned teams, oldest first, each keeping the color it was pinned with. */
  const [pinned, setPinned] = useState<{ id: number; color: number }[]>([]);
  const [hovered, setHovered] = useState<number | null>(null);
  const [tip, setTip] = useState<{ x: number; y: number; row: WeeklyRank } | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  if (weeks.length < 2 || n < 2) return null;

  const height = TOP + (n - 1) * ROW + BOTTOM;
  const x = (week: number) => LEFT + ((week - weeks[0]!) / (weeks.at(-1)! - weeks[0]!)) * (W - LEFT - RIGHT);
  const y = (rank: number) => TOP + (rank - 1) * ROW;
  const rowsOf = (id: number) => history.filter((r) => r.roster_id === id).sort((a, b) => a.week - b.week);
  const last = weeks.at(-1)!;

  const freeColor = (): number => [0, 1, 2].find((c) => !pinned.some((p) => p.color === c)) ?? 0;
  const colorOf = (id: number): string | null => {
    const pin = pinned.find((p) => p.id === id);
    if (pin) return PICKS[pin.color]!;
    if (id === hovered) return PICKS[freeColor()]!;
    return null;
  };
  const toggle = (id: number) =>
    setPinned((list) =>
      list.some((p) => p.id === id)
        ? list.filter((p) => p.id !== id)
        : [...(list.length >= MAX_PICKS ? list.slice(1) : list), { id, color: list.length >= MAX_PICKS ? list[0]!.color : freeColor() }],
    );
  const anyLit = pinned.length > 0 || hovered !== null;

  /** The week nearest the pointer, for the tooltip. */
  const pointAt = (id: number, clientX: number) => {
    const svg = svgRef.current;
    const matrix = svg?.getScreenCTM();
    if (!svg || !matrix) return;
    const point = new DOMPoint(clientX, 0).matrixTransform(matrix.inverse());
    const week = weeks.reduce((best, w) => (Math.abs(x(w) - point.x) < Math.abs(x(best) - point.x) ? w : best));
    const row = history.find((r) => r.roster_id === id && r.week === week);
    if (row) setTip({ x: x(week), y: y(row.rank), row });
  };

  // Draw resting lines first, lit lines last so they sit on top.
  const order = [...teams].sort((a, b) => Number(colorOf(a.roster_id) !== null) - Number(colorOf(b.roster_id) !== null));

  return (
    <Card i={i} className="panel" aria-labelledby="race-h">
      <h2 id="race-h">Standings, week by week</h2>
      <Bubble>
        Where every team stood after each week, ranked the way Sleeper ranks the standings. Hover a line or a team to
        follow it; click to pin up to three and compare.
      </Bubble>
      <div className="race-scroll">
        <div className="race-box">
          <svg
            ref={svgRef}
            className="race"
            viewBox={`0 0 ${W} ${height}`}
            role="img"
            aria-label={`Standings after each week, weeks ${weeks[0]} to ${last}. A table version follows.`}
            onMouseLeave={() => {
              setHovered(null);
              setTip(null);
            }}
          >
            {Array.from({ length: n }, (_, k) => (
              <g key={k}>
                <line className="race-grid" x1={LEFT} x2={W - RIGHT} y1={y(k + 1)} y2={y(k + 1)} />
                <text className="race-axis" x={LEFT - 12} y={y(k + 1)} textAnchor="end" dominantBaseline="middle">
                  #{k + 1}
                </text>
              </g>
            ))}
            {weeks.map((w) => (
              <text key={w} className="race-axis" x={x(w)} y={height - 12} textAnchor="middle">
                W{w}
              </text>
            ))}

            {order.map((team) => {
              const id = team.roster_id;
              const rows = rowsOf(id);
              const color = colorOf(id);
              const d = rows.map((r, k) => `${k === 0 ? 'M' : 'L'}${x(r.week)} ${y(r.rank)}`).join(' ');
              const end = rows.at(-1);
              return (
                <g
                  key={id}
                  className={`race-team ${color ? 'lit' : anyLit ? 'dim' : ''}`}
                  style={color ? ({ '--c': color } as CSSProperties) : undefined}
                  onMouseEnter={() => setHovered(id)}
                  onMouseMove={(event) => pointAt(id, event.clientX)}
                  onClick={() => toggle(id)}
                >
                  <path className="race-line" d={d} />
                  {color &&
                    rows.map((r) => <circle key={r.week} className="race-dot" cx={x(r.week)} cy={y(r.rank)} r={5} />)}
                  <path className="race-hit" d={d} />
                  {end && (
                    <text className="race-label" x={x(last) + 14} y={y(end.rank)} dominantBaseline="middle">
                      {short(name(id))}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          {tip && (
            <div
              // The scroll box clips anything above it, so near the top the tip
              // drops below the point; at the ends it hugs the inside edge.
              className={[
                'race-tip',
                tip.y < TOP + ROW * 2.5 ? 'below' : 'above',
                tip.x < LEFT + 90 ? 'from-left' : tip.x > W - RIGHT - 90 ? 'from-right' : '',
              ].join(' ')}
              style={{ left: `${(tip.x / W) * 100}%`, top: `${(tip.y / height) * 100}%` } as CSSProperties}
            >
              <strong>{name(tip.row.roster_id)}</strong>
              <span>
                Week {tip.row.week} · #{tip.row.rank} · {record(tip.row)} · {pts(tip.row.points_for)} PF
              </span>
            </div>
          )}
        </div>
      </div>

      <div className="race-legend" role="group" aria-label="Highlight a team">
        {teams.map((team) => {
          const id = team.roster_id;
          const color = colorOf(id);
          const isPinned = pinned.some((p) => p.id === id);
          return (
            <button
              key={id}
              type="button"
              className="race-chip"
              aria-pressed={isPinned}
              style={color ? ({ '--c': color } as CSSProperties) : undefined}
              onMouseEnter={() => setHovered(id)}
              onMouseLeave={() => setHovered(null)}
              onFocus={() => setHovered(id)}
              onBlur={() => setHovered(null)}
              onClick={() => toggle(id)}
            >
              {team.team_name}
            </button>
          );
        })}
        {pinned.length > 0 && (
          <button type="button" className="race-chip clear" onClick={() => setPinned([])}>
            Clear
          </button>
        )}
      </div>

      <details className="explainer">
        <summary>Show as a table</summary>
        <div className="table-box">
          <table className="table">
            <caption className="sr-only">Standings rank after each week</caption>
            <thead>
              <tr>
                <th scope="col">Team</th>
                {weeks.map((w) => (
                  <th key={w} scope="col" className="num">
                    W{w}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teams.map((team) => (
                <tr key={team.roster_id}>
                  <th scope="row">{team.team_name}</th>
                  {weeks.map((w) => (
                    <td key={w} className="num">
                      #{history.find((r) => r.roster_id === team.roster_id && r.week === w)?.rank ?? '–'}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </Card>
  );
}
