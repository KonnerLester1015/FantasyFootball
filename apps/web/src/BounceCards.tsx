// A fanned row of cards on springs: they pop in with a staggered bounce, sit in
// a slight fan, and the active card lifts and straightens while its neighbors
// slide aside. Adapted from the BounceCards component (React + Tailwind, image
// cards only) to this site: plain CSS, any card content via `renderCard`, and
// touch and keyboard as first-class ways to pick a card.
//
// Input → active card:
//   mouse     hover (leaving the row clears it)
//   touch/pen tap a card to lift it; tap it again, or anywhere else, to drop it
//   keyboard  focus a card (Tab) — focus is the selection
//
// Positions are written straight to each card's style from one rAF loop, which
// sleeps once everything settles. Reduced motion snaps every value to its target.

import { useEffect, useRef, type CSSProperties, type ReactNode } from 'react';

/** Resting tilt per card, as a fraction of `rotation`. */
const PATTERN = [1, 0.5, -0.3, -1, 0.2, 0.75, -0.6, 0.35, -0.85, 0.1];

interface Slot {
  x: number;
  y: number;
  rotate: number;
}

interface Body extends Slot {
  scale: number;
  vx: number;
  vy: number;
  vr: number;
  vs: number;
  born: number;
}

export interface BounceCardsProps<T> {
  items: readonly T[];
  itemKey: (item: T) => string;
  renderCard: (item: T, index: number) => ReactNode;
  /** The card's accessible name, e.g. "QB: Josh Allen, Team Name, 31.40 points". */
  cardLabel: (item: T) => string;
  /** Accessible name for the whole row. */
  label: string;
  cardWidth: number;
  cardHeight: number;
  /** Horizontal distance between neighboring card centers. */
  spread: number;
  /** Maximum resting tilt in degrees. */
  rotation?: number;
  /** How far the outermost cards drop below the middle ones, in px. */
  arc?: number;
  animationDelay?: number;
  animationStagger?: number;
  /** 0 = no overshoot, 1 = very springy pop-in. */
  bounciness?: number;
  /** How far neighbors slide away from the active card. */
  pushDistance?: number;
  hoverScale?: number;
  className?: string;
}

export function BounceCards<T>({
  items,
  itemKey,
  renderCard,
  cardLabel,
  label,
  cardWidth,
  cardHeight,
  spread,
  rotation = 4,
  arc = 14,
  animationDelay = 0.15,
  animationStagger = 0.07,
  bounciness = 0.6,
  pushDistance = 36,
  hoverScale = 1.06,
  className = '',
}: BounceCardsProps<T>) {
  const rootRef = useRef<HTMLDivElement>(null);
  const cardRefs = useRef<(HTMLElement | null)[]>([]);
  const wakeRef = useRef<(() => void) | null>(null);

  const middle = (items.length - 1) / 2;
  const reach = Math.max(1, middle);
  const settings = {
    slots: items.map((_, i): Slot => {
      const offset = i - middle;
      return { x: offset * spread, y: arc * (offset / reach) ** 2, rotate: rotation * PATTERN[i % PATTERN.length]! };
    }),
    width: cardWidth,
    height: cardHeight,
    delay: Math.max(0, animationDelay),
    stagger: Math.max(0, animationStagger),
    bounciness: Math.min(1, Math.max(0, bounciness)),
    pushDistance,
    hoverScale,
  };
  const settingsRef = useRef(settings);

  // Hand the latest props to the running loop and nudge it awake.
  useEffect(() => {
    settingsRef.current = settings;
    wakeRef.current?.();
  });

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;

    const reduce = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const bodies: Body[] = [];
    const state = { active: -1, time: 0, layer: -2 };
    let raf = 0;
    let last = performance.now();
    let alive = true;

    const body = (i: number): Body => {
      if (!bodies[i]) {
        const slot = settingsRef.current.slots[i] ?? { x: 0, y: 0, rotate: 0 };
        bodies[i] = { ...slot, scale: reduce ? 1 : 0, vx: 0, vy: 0, vr: 0, vs: 0, born: state.time };
      }
      return bodies[i];
    };

    const step = (value: number, velocity: number, target: number, stiffness: number, damping: number, dt: number) => {
      const next = velocity + ((target - value) * stiffness - velocity * damping) * dt;
      return [value + next * dt, next] as const;
    };

    const frame = (now: number) => {
      raf = 0;
      if (!alive) return;
      const s = settingsRef.current;
      const dt = Math.min(1 / 30, Math.max(1 / 240, (now - last) / 1000));
      last = now;
      state.time += dt;

      const active = state.active;
      const popStiffness = 170;
      const popDamping = 2 * (1 - 0.85 * s.bounciness) * Math.sqrt(popStiffness);
      const moveStiffness = 210;
      const moveDamping = 2 * 0.72 * Math.sqrt(moveStiffness);
      const substeps = Math.ceil(dt / (1 / 240));
      const h = dt / substeps;
      let moving = 0;

      s.slots.forEach((slot, i) => {
        const el = cardRefs.current[i];
        if (!el) return;
        const card = body(i);
        const appeared = reduce || state.time - card.born >= s.delay + i * s.stagger;
        let tx = slot.x;
        let ty = slot.y;
        let tr = slot.rotate;
        const ts = appeared ? (i === active ? s.hoverScale : 1) : 0;
        if (active >= 0 && appeared) {
          if (i === active) {
            ty = slot.y - s.height * 0.05;
            tr = 0;
          } else {
            tx = slot.x + Math.sign(i - active) * s.pushDistance;
          }
        }
        if (reduce) {
          Object.assign(card, { x: tx, y: ty, rotate: tr, scale: ts, vx: 0, vy: 0, vr: 0, vs: 0 });
        } else {
          for (let k = 0; k < substeps; k++) {
            [card.x, card.vx] = step(card.x, card.vx, tx, moveStiffness, moveDamping, h);
            [card.y, card.vy] = step(card.y, card.vy, ty, moveStiffness, moveDamping, h);
            [card.rotate, card.vr] = step(card.rotate, card.vr, tr, moveStiffness, moveDamping, h);
            [card.scale, card.vs] = step(card.scale, card.vs, ts, popStiffness, popDamping, h);
          }
        }
        moving +=
          Math.abs(card.vx) + Math.abs(card.vy) + Math.abs(card.vr) + Math.abs(card.vs) * 100 +
          Math.abs(tx - card.x) + Math.abs(ty - card.y) + Math.abs(tr - card.rotate) +
          Math.abs(ts - card.scale) * 100 + (appeared ? 0 : 1);
        el.style.transform =
          `translate(-50%, -50%) translate3d(${card.x.toFixed(2)}px, ${card.y.toFixed(2)}px, 0) ` +
          `rotate(${card.rotate.toFixed(3)}deg) scale(${Math.max(0, card.scale).toFixed(4)})`;
      });

      if (state.layer !== active) {
        state.layer = active;
        cardRefs.current.forEach((el, i) => {
          if (!el) return;
          el.style.zIndex = String(i === active ? s.slots.length + 1 : i + 1);
          el.toggleAttribute('data-active', i === active);
        });
      }

      if (moving > 0.02) raf = requestAnimationFrame(frame);
    };

    const wake = () => {
      if (raf || !alive) return;
      last = performance.now();
      raf = requestAnimationFrame(frame);
    };
    wakeRef.current = wake;

    const activate = (index: number) => {
      if (index === state.active) return;
      state.active = index;
      wake();
    };

    /** The card under the pointer, by slot position (cards move, slots don't). */
    const pick = (event: PointerEvent): number => {
      const s = settingsRef.current;
      const rect = root.getBoundingClientRect();
      const px = event.clientX - rect.left - rect.width / 2;
      const py = event.clientY - rect.top - rect.height / 2;
      let best = -1;
      let distance = Infinity;
      s.slots.forEach((slot, i) => {
        const gap = Math.abs(px - slot.x);
        if (gap < distance) {
          distance = gap;
          best = i;
        }
      });
      if (best < 0) return -1;
      const slot = s.slots[best]!;
      if (Math.abs(py - slot.y) > s.height / 2 + 12 || distance > s.width / 2 + 12) return -1;
      // Hysteresis: keep the current card until the pointer is clearly nearer another.
      const current = s.slots[state.active];
      if (current && state.active !== best && Math.abs(px - current.x) - distance < 6) return state.active;
      return best;
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') activate(pick(event));
    };
    const onLeave = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') activate(-1);
    };
    const onDown = (event: PointerEvent) => {
      if (event.pointerType === 'mouse') return;
      const index = pick(event);
      activate(index === state.active ? -1 : index);
    };
    /** A tap anywhere outside the row drops the lifted card. */
    const onDocumentDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' && !root.contains(event.target as Node)) activate(-1);
    };
    const onFocus = (event: FocusEvent) => {
      const index = cardRefs.current.indexOf(event.target as HTMLElement);
      if (index >= 0 && index !== state.active) activate(index);
    };
    const onBlur = (event: FocusEvent) => {
      if (!root.contains(event.relatedTarget as Node | null)) activate(-1);
    };

    root.addEventListener('pointermove', onMove);
    root.addEventListener('pointerleave', onLeave);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('focusin', onFocus);
    root.addEventListener('focusout', onBlur);
    document.addEventListener('pointerdown', onDocumentDown);
    wake();

    return () => {
      alive = false;
      cancelAnimationFrame(raf);
      wakeRef.current = null;
      root.removeEventListener('pointermove', onMove);
      root.removeEventListener('pointerleave', onLeave);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('focusin', onFocus);
      root.removeEventListener('focusout', onBlur);
      document.removeEventListener('pointerdown', onDocumentDown);
    };
  }, []);

  return (
    <div
      ref={rootRef}
      role="list"
      aria-label={label}
      className={`bounce-cards ${className}`}
      style={
        {
          '--bounce-w': `${cardWidth}px`,
          '--bounce-h': `${cardHeight}px`,
          height: cardHeight * hoverScale + arc + 32,
        } as CSSProperties
      }
    >
      {items.map((item, i) => (
        <article
          key={itemKey(item)}
          ref={(el) => {
            cardRefs.current[i] = el;
          }}
          role="listitem"
          tabIndex={0}
          aria-label={cardLabel(item)}
          className="bounce-card"
          style={{ zIndex: i + 1 }}
        >
          {renderCard(item, i)}
        </article>
      ))}
    </div>
  );
}
