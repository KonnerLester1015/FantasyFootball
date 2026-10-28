# Design Brief — "Sunday Funnies"

The approved look for the site: a warm, friendly, hand-inked comic-strip feel on a tan ground, with springy animations. All art is original (footballs, helmets, pennants, motion arcs). Do not draw or imitate any existing cartoon characters.

Reference: the "A · Sunday Funnies" artboard in the Claude canvas "Family Feud Look and Feel". This file is the source of truth for the build.

## 1. Colors (CSS variables)

```css
:root {
  --ground:   #E3D5BF;  /* page background, warm tan */
  --paper:    #FBF4E6;  /* cards, table */
  --ink:      #2B2118;  /* outlines, text, hard shadows */
  --ink-soft: #5B4636;  /* secondary text (passes 4.5:1 on paper) */
  --blue:     #2F6DB5;  /* primary accent, good/high values */
  --brown:    #9A5B1E;  /* football brown, mid values */
  --yellow:   #F2C230;  /* active tab, current nav, "in" chips */
  --butter:   #F6D77A;  /* highlight card */
  --red:      #B3402A;  /* low values, negative signals */
  --track:    #EADFCB;  /* bar tracks, inactive chips */
  --hover:    #FFF0C2;  /* table row hover */
  --divider:  #CDBB9F;  /* dashed row dividers */
}
```

Rules: color is never the only signal; every bar shows its value as text, chips say "In top 6" / "Outside". Value colors for percent charts: blue at 60% or higher, brown from 35% to 60%, red below 35%.

## 2. Type

- Display and big numbers: **Londrina Solid** (weights 400, 900), headings 36–58 px, line-height about 1.
- Body, tables, labels: **Patrick Hand**, 18–22 px.
- Load via Google Fonts or self-host the files in `apps/web/public/fonts` (preferred, no third-party request).
- Fallbacks: `'Comic Sans MS', cursive` for body, `cursive` for display.

## 3. Shape language

- Borders: whole pixels only (`--line-thin` 2 px, `--line` 3 px, `--line-thick` 4 px): 4 px on cards and panels, 3 px on pills, tabs, tables and inner boxes, 2 px on chips and chart tracks. Fractional widths land between device pixels and smear.
- Hand-drawn corners: irregular radii, for example `border-radius: 30px 22px 34px 24px / 24px 34px 22px 30px`. Vary the four values per card so nothing looks stamped. Define 4–5 radius variants as variables and cycle them.
- Hard offset shadow, no blur: `--shadow-card` (`4px 5px 0`) on cards and panels, `--shadow-control` (`3px 3px 0`) on pills, tabs and buttons.
- Cards sit square. (They used to tilt ±0.4–0.8°; a rotated card re-rasterizes its text and borders off the pixel grid and looked blurry and grainy while scrolling. The irregular radii carry the hand-drawn feel.) Decorative art (football, helmet) may still rotate.
- Table: paper background, ink border, dashed `--divider` row lines (2 px), alternate rows in `--zebra`, `--hover` on hover, tabular numerals, horizontal scroll box on narrow screens.
- Scrollbars: `--track` track, `--scroll-thumb` rounded thumb, `--scroll-thumb-hover` (brown) on hover; same on the page and every horizontal scroll box.
- Dashed ink lines for field/motion decoration (`stroke-dasharray`).

## 4. Components

| Component | Notes |
|---|---|
| Header | Original helmet icon + "Family Feud" in Londrina 900 (about 50 px) + tagline; right-aligned nav pills that wrap on phones |
| Nav pill | Ink border, hard shadow, active pill is `--yellow`; hover lifts 3 px and turns yellow |
| Hero panel | Paper card, big headline ("Week N is in the books!"), one-line status, animated football with a dashed arc |
| Stat cards (4) | Equal-width grid: 4 across, 2 on tablets, 1 on phones. Label small, number in Londrina 50 px (shrinks only when a card is too narrow for the value) colored by meaning (blue points, ink high score, brown margin, red negative), name below. One card uses `--butter` |
| Sort tabs | Real `<button>`s: "Standings order", "Most points", "Playoff odds"; active is yellow; press moves down 2 px |
| Standings table | Real `<table>`; rank in Londrina, playoff odds as a bar in an ink-outlined track with the % at the right, chip "In top 6" (yellow) or "Outside" |
| Bar chart | Horizontal bars in outlined tracks, value at the right, team label right-aligned at the left |
| Speech bubble | White, thick ink border, large irregular radius, tail pointing to the card it explains; used for plain-language definitions |
| Lock screen (Money) | Speech-bubble card with a passcode field and a big friendly button; wrong passcode shakes the card |

Other pages reuse the same system: Playoffs bracket as comic panels with dashed connectors; History record book as trophy cards with "previous holder" in `--red`; Weekly Recap as a single tall screenshot-friendly strip.

## 5. Motion

All animations are CSS or the `motion` (Framer Motion) library; respect reduced motion.

| Effect | Spec |
|---|---|
| Load-in (cards, rows) | `opacity 0→1` and `translateY(16px)→0`, 0.5–0.6 s, stagger 40–50 ms per item |
| Bars | `scaleX(0)→1` from the left, 0.9 s, `cubic-bezier(.2,.9,.3,1)`, same stagger |
| Card hover | Lift `-4px`, shadow grows to `6px 8px 0`; spring easing `cubic-bezier(.3,1.6,.5,1)`, 0.25 s. Panels (tables, charts) don't move |
| Nav pill hover | `translateY(-3px)`, yellow fill |
| Tab press | `translateY(2px)` on active |
| Hero football | Floats up and down 16 px while rotating -14° to 10°, 3.2 s loop; dashed arc "marches" with `stroke-dashoffset`, 1.4 s linear loop |
| Helmet icon | Wiggles ±3° on hover |
| Table re-sort | Rows slide to their new positions (use motion's `layout` animation, about 0.35 s spring) instead of snapping |
| Number changes | Count up from the previous value over about 0.6 s when data refreshes |

Reduced motion: `@media (prefers-reduced-motion: reduce) { * { animation: none !important; transition: none !important; } }` and disable layout and count-up animations.

## 6. Favicon and app icons

Simple football on a tan rounded square. Source file `favicon.svg` (also copy to `apps/web/public/favicon.svg`):

```svg
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#E3D5BF"/><g transform="rotate(-28 32 32)"><ellipse cx="32" cy="32" rx="25" ry="15" fill="#9A5B1E" stroke="#2B2118" stroke-width="4"/><path d="M19 32H45" stroke="#FBF4E6" stroke-width="3.5" stroke-linecap="round"/><path d="M25 26V38M32 26V38M39 26V38" stroke="#FBF4E6" stroke-width="3" stroke-linecap="round"/></g></svg>
```

Generate from it: `favicon.ico` (32×32), `apple-touch-icon.png` (180×180), `icon-192.png`, `icon-512.png`, and a `site.webmanifest` with `name: "Family Feud"`, `background_color: #E3D5BF`, `theme_color: #E3D5BF`. In `index.html` add `<link rel="icon" href="/favicon.svg" type="image/svg+xml">`, an ICO fallback, the apple-touch-icon link, and `<meta name="theme-color" content="#E3D5BF">`. Also use the football as the loading spinner (rolling) and the 404 page art.

## 7. Layout and responsiveness

- Container `max-width: 1180px`, side padding 20 px, vertical gap about 32 px.
- Cards use flex-wrap with `flex: 1 1 240px`; two-column sections wrap to one column on phones.
- Nav wraps; tables scroll horizontally inside their own box.
- Touch targets at least 44 px; real buttons and links only.

## 8. Accessibility checklist

- Text contrast at least 4.5:1 (large text 3:1); check yellow and blue fills with ink or white text.
- Decorative SVGs are `aria-hidden="true"`; informative charts have text values on screen.
- Visible focus ring: 3 px solid `--blue` offset 3 px on all interactive elements.
- Sort tabs expose pressed state (`aria-pressed`); table has a caption or `aria-label`.
