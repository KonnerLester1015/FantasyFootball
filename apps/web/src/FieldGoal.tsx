// A toy, not a game: drag the football (or tap it) to kick it at the uprights.
// Nothing is counted or kept. The physics runs in the SVG's viewBox units, so a
// kick behaves the same at every screen width, and each frame is written
// straight to the DOM rather than through React state.

import { useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import { Football, reducedMotion } from './ui';

type Vec = { x: number; y: number };
type Flight = Vec & { vx: number; vy: number; rot: number; spin: number; t: number; crossed: boolean; done: boolean };
type Bit = Vec & { vx: number; vy: number; rot: number; spin: number; life: number };

const W = 640;
const H = 300;
const GROUND = 262;
const R = 16; // the ball's collision radius
const TEE: Vec = { x: 90, y: GROUND - R };
const POST_X = 520; // the goal plane, through the middle of the crossbar
const BAR_Y = 167;
const GRAVITY = 800;
const MAX_PULL = 150;
// The square root makes short pulls strong, so anything past about a third of
// a full pull at a sensible angle clears the bar. Forgiving on purpose.
const MAX_SPEED = 1100;
const TAP = 10; // a pull shorter than this is a tap: kick a gimme
const RESET_MS = 800;
const BITS = 24;
const COLORS = ['var(--yellow)', 'var(--blue)', 'var(--red)', 'var(--butter)', 'var(--brown)'];

// The uprights seen at an angle: two posts, the crossbar, and the gooseneck.
const POSTS = 'M506 174V54M534 160V40M506 174L534 160M520 167C520 206 548 196 548 232V262';

/** Flick toward the posts, or pull back away from them like a slingshot. */
function launch(pull: Vec): Vec {
  const len = Math.hypot(pull.x, pull.y);
  const speed = MAX_SPEED * Math.sqrt(Math.min(len, MAX_PULL) / MAX_PULL);
  const sign = pull.x > 0 ? 1 : -1;
  return { x: ((sign * pull.x) / len) * speed, y: ((sign * pull.y) / len) * speed };
}

function gimme(): Vec {
  const angle = ((42 + Math.random() * 16) * Math.PI) / 180;
  const speed = 800 + Math.random() * 180;
  return { x: Math.cos(angle) * speed, y: -Math.sin(angle) * speed };
}

export function FieldGoal() {
  const svg = useRef<SVGSVGElement>(null);
  const ball = useRef<SVGGElement>(null);
  const aim = useRef<SVGPathElement>(null);
  const band = useRef<SVGLineElement>(null);
  const bits = useRef<(SVGRectElement | null)[]>([]);
  const drag = useRef<{ id: number; start: Vec; pull: Vec } | null>(null);
  const flight = useRef<Flight | null>(null);
  const confetti = useRef<Bit[]>([]);
  const frame = useRef(0);
  const last = useRef(0);
  const timer = useRef(0);
  const [played, setPlayed] = useState(false);
  const [callout, setCallout] = useState<{ good: boolean; n: number } | null>(null);

  // Touches that start on the ball drag it; everywhere else the page scrolls.
  // React's touch listeners are passive, so this one is attached by hand.
  useEffect(() => {
    const el = ball.current;
    if (!el) return;
    const hold = (e: TouchEvent) => e.preventDefault();
    el.addEventListener('touchstart', hold, { passive: false });
    return () => {
      el.removeEventListener('touchstart', hold);
      cancelAnimationFrame(frame.current);
      window.clearTimeout(timer.current);
    };
  }, []);

  const place = (x: number, y: number, rot: number) =>
    ball.current?.setAttribute('transform', `translate(${x.toFixed(1)} ${y.toFixed(1)}) rotate(${rot.toFixed(1)})`);

  const toWorld = (e: PointerEvent): Vec => {
    const ctm = svg.current?.getScreenCTM();
    if (!ctm) return { x: 0, y: 0 };
    const p = new DOMPoint(e.clientX, e.clientY).matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  };

  const drawAim = (pull: Vec | null) => {
    const len = pull ? Math.hypot(pull.x, pull.y) : 0;
    if (!pull || len < TAP) {
      aim.current?.setAttribute('d', '');
      band.current?.setAttribute('visibility', 'hidden');
      return;
    }
    const k = Math.min(1, MAX_PULL / len);
    band.current?.setAttribute('x2', String(TEE.x + pull.x * k));
    band.current?.setAttribute('y2', String(TEE.y + pull.y * k));
    band.current?.setAttribute('visibility', 'visible');
    // Only the first half second of the arc: a hint, not a guarantee.
    const v = launch(pull);
    let d = `M${TEE.x} ${TEE.y}`;
    for (let t = 0.04; t <= 0.56; t += 0.04) {
      d += `L${(TEE.x + v.x * t).toFixed(1)} ${(TEE.y + v.y * t + (GRAVITY * t * t) / 2).toFixed(1)}`;
    }
    aim.current?.setAttribute('d', d);
  };

  const burst = (x: number, y: number) => {
    if (reducedMotion()) return;
    confetti.current = Array.from({ length: BITS }, () => {
      const angle = -Math.PI * (0.1 + Math.random() * 0.8);
      const speed = 150 + Math.random() * 270;
      return {
        x,
        y,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        rot: Math.random() * 360,
        spin: (Math.random() - 0.5) * 900,
        life: 1.1 + Math.random() * 0.4,
      };
    });
  };

  const reset = () => {
    flight.current = null;
    ball.current?.classList.remove('is-flying');
    place(TEE.x, TEE.y, 0);
    setCallout(null);
  };

  const fly = (f: Flight, dt: number) => {
    const px = f.x;
    const py = f.y;
    f.t += dt;
    f.vy += GRAVITY * dt;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.rot += f.spin * dt;

    // Doink: bounce off the crossbar. One that bounces over still counts.
    const dx = f.x - POST_X;
    const dy = f.y - BAR_Y;
    const dist = Math.hypot(dx, dy);
    const dot = (f.vx * dx + f.vy * dy) / (dist || 1);
    if (dist < R + 4 && dot < 0) {
      const nx = dx / (dist || 1);
      const ny = dy / (dist || 1);
      f.vx -= 1.6 * dot * nx;
      f.vy -= 1.6 * dot * ny;
      f.spin *= -0.6;
      f.x = POST_X + nx * (R + 4);
      f.y = BAR_Y + ny * (R + 4);
      setCallout((c) => ({ good: false, n: (c?.n ?? 0) + 1 }));
    }

    if (!f.crossed && px < POST_X && f.x >= POST_X) {
      f.crossed = true;
      const y = py + ((f.y - py) * (POST_X - px)) / (f.x - px);
      if (y < BAR_Y) {
        setCallout((c) => ({ good: true, n: (c?.n ?? 0) + 1 }));
        burst(POST_X, Math.max(y, 40));
      }
    }

    if (f.y > GROUND - R) {
      f.y = GROUND - R;
      if (f.vy > 0) {
        f.vy = f.vy > 120 ? -f.vy * 0.45 : 0;
        f.vx *= 0.7;
        f.spin *= 0.5;
      }
      if (f.vy === 0) {
        f.vx *= Math.pow(0.15, dt);
        f.spin *= Math.pow(0.15, dt);
      }
    }

    const gone = f.x > W + 60 || f.x < -60 || f.t > 6;
    const resting = f.vy === 0 && f.y === GROUND - R && Math.abs(f.vx) < 20;
    if (!f.done && (gone || resting)) {
      f.done = true;
      timer.current = window.setTimeout(reset, RESET_MS);
    }
    place(f.x, f.y, f.rot);
  };

  const shower = (dt: number): boolean => {
    let live = false;
    confetti.current.forEach((b, i) => {
      const el = bits.current[i];
      if (b.life <= 0 || !el) return;
      b.life -= dt;
      b.vy += 600 * dt;
      b.vx *= Math.pow(0.4, dt);
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      b.rot += b.spin * dt;
      el.setAttribute('transform', `translate(${b.x.toFixed(1)} ${b.y.toFixed(1)}) rotate(${b.rot.toFixed(0)})`);
      el.setAttribute('opacity', String(Math.max(0, Math.min(1, b.life * 2))));
      live ||= b.life > 0;
    });
    return live;
  };

  const tick = (now: number) => {
    const dt = Math.min((now - last.current) / 1000, 1 / 30);
    last.current = now;
    const f = flight.current;
    if (f && !f.done) fly(f, dt);
    const live = shower(dt) || Boolean(f && !f.done);
    frame.current = live ? requestAnimationFrame(tick) : 0;
  };

  const kick = (v: Vec) => {
    const speed = Math.hypot(v.x, v.y);
    flight.current = { ...TEE, vx: v.x, vy: v.y, rot: 0, spin: Math.sign(v.x || 1) * speed * 0.7, t: 0, crossed: false, done: false };
    ball.current?.classList.add('is-flying');
    if (!frame.current) {
      last.current = performance.now();
      frame.current = requestAnimationFrame(tick);
    }
  };

  const onPointerDown = (e: PointerEvent<SVGGElement>) => {
    if (flight.current || (e.pointerType === 'mouse' && e.button !== 0)) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    e.currentTarget.classList.add('is-dragging');
    drag.current = { id: e.pointerId, start: toWorld(e), pull: { x: 0, y: 0 } };
    setPlayed(true);
  };

  const onPointerMove = (e: PointerEvent<SVGGElement>) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    const p = toWorld(e);
    d.pull = { x: p.x - d.start.x, y: p.y - d.start.y };
    drawAim(d.pull);
  };

  const end = (e: PointerEvent<SVGGElement>, release: boolean) => {
    const d = drag.current;
    if (!d || d.id !== e.pointerId) return;
    drag.current = null;
    e.currentTarget.classList.remove('is-dragging');
    drawAim(null);
    if (release) kick(Math.hypot(d.pull.x, d.pull.y) < TAP ? gimme() : launch(d.pull));
  };

  const onKeyDown = (e: KeyboardEvent<SVGGElement>) => {
    if (e.key !== 'Enter' && e.key !== ' ') return;
    e.preventDefault();
    if (flight.current) return;
    setPlayed(true);
    kick(gimme());
  };

  return (
    <div className="fg">
      <svg ref={svg} viewBox={`0 0 ${W} ${H}`} role="group" aria-label="Field goal toy">
        <rect x="0" y={GROUND} width={W} height={H - GROUND} fill="var(--track)" />
        <path d={`M0 ${GROUND}H${W}`} stroke="var(--ink)" strokeWidth="3" />
        <path d={`M40 ${GROUND + 18}H${W - 40}`} stroke="var(--divider)" strokeWidth="3" strokeDasharray="10 22" />
        <path d={`M${TEE.x - 9} ${GROUND}L${TEE.x} ${GROUND - 9}L${TEE.x + 9} ${GROUND}Z`} fill="var(--red)" stroke="var(--ink)" strokeWidth="2.5" strokeLinejoin="round" />

        <g
          key={`posts-${callout?.good ? callout.n : 0}`}
          className={callout?.good ? 'fg-posts cheer' : 'fg-posts'}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d={POSTS} stroke="var(--ink)" strokeWidth="11" />
          <path d={POSTS} stroke="var(--yellow)" strokeWidth="5" />
        </g>

        <line ref={band} x1={TEE.x} y1={TEE.y} x2={TEE.x} y2={TEE.y} className="fg-band" visibility="hidden" />
        <path ref={aim} d="" className="fg-aim" />

        {callout && (
          <text key={`callout-${callout.n}`} className="fg-callout" x={callout.good ? 430 : POST_X - 40} y={callout.good ? 80 : BAR_Y - 30}>
            {callout.good ? 'Good!' : 'Doink!'}
          </text>
        )}

        <g
          ref={ball}
          className="fg-ball"
          transform={`translate(${TEE.x} ${TEE.y}) rotate(0)`}
          role="button"
          tabIndex={0}
          aria-label="Kick the football"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={(e) => end(e, true)}
          onPointerCancel={(e) => end(e, false)}
          onKeyDown={onKeyDown}
        >
          <circle className="fg-hit" r="46" />
          <g transform="translate(-26 -26)">
            <Football size={52} />
          </g>
        </g>

        {Array.from({ length: BITS }, (_, i) => (
          <rect
            key={i}
            ref={(el) => {
              bits.current[i] = el;
            }}
            x="-4"
            y="-2"
            width="8"
            height="4"
            fill={COLORS[i % COLORS.length]}
            opacity="0"
          />
        ))}
      </svg>
      <p className={played ? 'fg-hint gone' : 'fg-hint'} aria-hidden="true">
        Drag &amp; release
      </p>
      <p className="sr-only" aria-live="polite">
        {callout ? (callout.good ? 'Good!' : 'Doink!') : ''}
      </p>
    </div>
  );
}
