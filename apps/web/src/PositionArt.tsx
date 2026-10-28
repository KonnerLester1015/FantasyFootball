// Card backgrounds for the weekly position leaders: one original doodle per
// position, built from the site's own football and helmet. Decorative only —
// the card's text and aria-label carry the meaning.

import type { LeaderPosition } from '@sunday-funnies/core';
import type { JSX } from 'react';
import { FootballShape, HelmetShape } from './ui';

const INK = { stroke: 'var(--ink)', strokeLinecap: 'round', strokeLinejoin: 'round', fill: 'none' } as const;

/** Faint dashed yard lines behind every drawing, so the six read as one set. */
function YardLines() {
  return (
    <path
      d="M40 0V120M80 0V120M120 0V120M160 0V120"
      stroke="var(--paper)"
      strokeWidth="3"
      strokeDasharray="3 9"
      strokeLinecap="round"
    />
  );
}

/** QB: a helmet and a dashed throwing arc that lands on the ball. */
function Quarterback() {
  return (
    <>
      <path d="M58 58Q110-8 158 40" {...INK} strokeWidth="3" strokeDasharray="8 9" />
      <g transform="translate(138 18) scale(0.62)">
        <FootballShape angle={30} />
      </g>
      <path d="M178 30l8-6M180 44h10" {...INK} strokeWidth="3" />
      <g transform="translate(12 56) scale(0.95)">
        <HelmetShape />
      </g>
    </>
  );
}

/** RB: the ball tucked under an arm, motion lines streaming behind. */
function RunningBack() {
  return (
    <>
      <path d="M18 44h46M8 62h52M22 80h40" {...INK} strokeWidth="4" />
      <circle cx="30" cy="104" r="7" fill="var(--paper)" stroke="var(--ink)" strokeWidth="3" />
      <circle cx="46" cy="108" r="5" fill="var(--paper)" stroke="var(--ink)" strokeWidth="3" />
      <g transform="translate(68 20) scale(1.25)">
        <FootballShape angle={-12} />
      </g>
      <path d="M78 92q40 22 84-10" {...INK} strokeWidth="16" />
      <path d="M78 92q40 22 84-10" stroke="var(--blue)" strokeWidth="9" strokeLinecap="round" fill="none" />
    </>
  );
}

/** WR: a route tree out of the huddle, with the ball dropping in at the top. */
function WideReceiver() {
  return (
    <>
      <path d="M100 104V58" {...INK} strokeWidth="4" />
      <path d="M100 58L46 28M100 58l54-30M100 58H48M100 58h52M100 58V22" {...INK} strokeWidth="3" strokeDasharray="7 8" />
      <path d="M40 24l-6 4 4 6M160 24l6 4-4 6" {...INK} strokeWidth="3" />
      <circle cx="100" cy="108" r="8" fill="var(--paper)" stroke="var(--ink)" strokeWidth="3.5" />
      <g transform="translate(118 0) scale(0.6)">
        <FootballShape angle={-60} />
      </g>
    </>
  );
}

/** TE: a bulky helmet behind a blocking shield. */
function TightEnd() {
  return (
    <>
      <g transform="translate(14 22) scale(1.35)">
        <HelmetShape shell="var(--brown)" />
      </g>
      <path
        d="M118 22h58v42c0 26-14 40-29 48-15-8-29-22-29-48z"
        fill="var(--blue)"
        stroke="var(--ink)"
        strokeWidth="4"
        strokeLinejoin="round"
      />
      <path d="M132 50l15 14 15-14" stroke="var(--paper)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M108 30l-8-4M106 60h-10M108 88l-8 4" {...INK} strokeWidth="3" />
    </>
  );
}

/** K: the ball up on a tee, aimed through the uprights. */
function Kicker() {
  return (
    <>
      <path d="M150 112V72M118 72h64M118 72V12M182 72V12" {...INK} strokeWidth="11" />
      <path d="M150 112V72M118 72h64M118 72V12M182 72V12" stroke="var(--yellow)" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" fill="none" />
      <path d="M62 78Q100 0 150 40" {...INK} strokeWidth="3" strokeDasharray="8 9" />
      <g transform="translate(26 50) scale(0.75)">
        <FootballShape angle={-80} />
      </g>
      <path d="M40 112h28l-5-14H45z" fill="var(--red)" stroke="var(--ink)" strokeWidth="3.5" strokeLinejoin="round" />
    </>
  );
}

/** DEF: a brick wall with a helmet peeking over the top. */
function Defense() {
  const bricks: [number, number][] = [];
  for (let row = 0; row < 3; row++) {
    for (let col = -1; col < 6; col++) bricks.push([col * 40 + (row % 2) * 20, 72 + row * 16]);
  }
  return (
    <>
      <g transform="translate(66 24) scale(0.9)">
        <HelmetShape shell="var(--red)" />
      </g>
      {bricks.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width="40" height="16" fill="var(--brown)" stroke="var(--ink)" strokeWidth="3" />
      ))}
      <path d="M0 72H200" {...INK} strokeWidth="4" />
    </>
  );
}

const ART: Record<LeaderPosition, () => JSX.Element> = {
  QB: Quarterback,
  RB: RunningBack,
  WR: WideReceiver,
  TE: TightEnd,
  K: Kicker,
  DEF: Defense,
};

export function PositionArt({ position }: { position: LeaderPosition }) {
  const Drawing = ART[position];
  return (
    <svg className="position-art" viewBox="0 0 200 120" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <YardLines />
      <Drawing />
    </svg>
  );
}
