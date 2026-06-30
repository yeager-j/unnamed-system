# Brand Guide — Showtime!

> Status: **working draft** (first surface migrated — the Corpus builder movement).
> The system is named **Showtime!** — also the name of its signature finisher (§8).
> The title and the table war cry are the same word, by design.
>
> **The app is dark-only.** Light mode was explored and retired (see §4) — the
> brand's whole vibe is a darkened theater, and a light surface kept fighting it.

This is the canonical reference for the app's visual identity and the reasoning
behind it. It supersedes the old "literary/neutral" look — a warm paper-and-ink
manuscript that was a fine *placeholder* for an unnamed game but had no point of
view about what the game is.

---

## 1. Positioning

**The strategic call: lean all the way into the Persona DNA — don't be another
serious fantasy system.** Serious traditional fantasy is the most crowded shelf in
the hobby (D&D owns the mainstream, Pathfinder the crunch, Draw Steel the tactical
lane). "The stylish, upbeat, tarot-soaked JRPG you play at the table" is a wide-open
niche with no flagship. We define a category instead of placing fifth in one.

**Tone: upbeat and fun, not grim.** The game is a celebration, not a dirge.

**The unifying concept: _show business_.** The designer loves Persona 3, 4, and 5
equally and won't crown a favorite. Their palettes clash (P5 acid-red stage, P4
pop-yellow TV, P3 cool-blue concert). "Show business" is the umbrella that contains
all three — stage, screen, and concert hall are departments of one industry — so it
honors every game without one dominating. It's also load-bearing: a **Persona is a
performed self** (the face you wear for the audience), and show business is the
business of performing identities. The **Chains** mechanic (facing the self behind
the performance — pure Persona 4) is the dark underbelly: growth is dropping the act.

**The brand in one line:**

> **A mystical theater** — show business meets the tarot table. The Velvet Room
> reimagined as a stage: a black house scattered with stars, lit by purple and gold.

**The name: _Showtime!_** The system is named after its signature mechanic — the
All-Out Attack (§8) — fulfilling the original instinct to "name the system after the
most exciting moment." The table war cry *is* the title: shout "Showtime!" to trigger
the all-party finisher and the game says its own name. Title and signature mechanic
sharing one word is intentional.

The tarot anchor is the game's own content: Arcana, Collaborators-by-Major-Arcana,
and the Spoils deck are already tarot. The reference object is a black-and-gold
celestial tarot deck — thin gold line-work on matte black.

---

## 2. Principles

The rules that decide the hundred small questions this guide doesn't enumerate.

1. **Branded chrome, calm core.** This is a *tracking tool*, read for hours at a
   table, not a title screen glimpsed for seconds. The brand lives in the **frame**
   (marquee, headers, the rare celebratory moments); the **working data stays calm
   and legible.** A spotlight only reads bright because the rest of the stage is dark.
2. **Set the tone; don't compete.** Played in person. The app is the theater lobby
   that sets the mood — never video-game graphics fighting for attention mid-session.
3. **Restraint is the luxury.** Generic-SaaS minimalism isn't the enemy — it's the
   *discipline* that keeps the theater from going gaudy. A little gold on a lot of
   restraint reads expensive; a lot of gold reads costume-shop.
4. **Gold sings on the dark stage.** Gold needs a dark ground to read as metal. The
   whole brand living in the dark is *why* the gold can be used as gilt at all — no
   light surface to wash it out to bronze.
5. **Elevation by tone + border, not shadow.** On a near-black ground drop shadows
   barely read — you'd have to lift the background to a mid-gray to make them visible,
   which kills the deep-theater look. So every tier separates by a lighter surface
   tone + a hairline border: `card`/`popover` sit above `background`, overlays a touch
   lighter again. Shadows are at most a faint optional aid on true overlays, never the
   primary cue. (Gold gilt does most of the "lifting" the eye reads anyway.)
6. **Motion budget scales inversely with frequency** (§7).
7. **Two registers, enforced by the toolkit.** Fonts and icons each split into an
   ornate *brand voice* and a clean *instrument voice*. Structural, not case-by-case.

---

## 3. Color

**Roles:** **purple = hero** (the owned brand color, the working primary),
**gold = precious accent** (decorative metal, rationed), **near-black = the stage.**

**Why purple?** The color the designer loves and had never used; no Persona game owns
it (P5 red / P4 yellow / P3 blue), so it honors all three; it's theatrical (velvet,
royalty) and occult (twilight, the cosmic) — the binder of tarot and theater.

**HP green / SP blue / destructive red are preserved** — semantic clarity on the
numbers that matter beats theme.

### Tokens — the single theme (`packages/ui/src/styles/globals.css`, `:root`)

OKLCH. The dark base leans neutral-cool (hue ~286) so the purple and gold do the
coloring; the purple is a **rich grape** (deeper/more saturated than a pastel lavender).

| Token | Value | Note |
| --- | --- | --- |
| `--background` | `0.141 0.005 286` | cool near-black house |
| `--foreground` | `0.985 0 0` | near-white |
| `--card` / `--popover` | `0.21 0.006 286` | lifted neutral surface |
| `--primary` | `0.432 0.232 293` | rich grape purple |
| `--primary-foreground` | `0.969 0.016 294` | near-white text on purple |
| `--secondary` / `--muted` / `--accent` | `0.274 0.006 286` | neutral dark |
| `--border` / `--input` | `white / 10–15%` | hairline |
| `--ring` | `0.552 0.016 286` | focus |
| `--destructive` | `0.704 0.191 22` | red |
| `--gold` | `0.82 0.13 85` | accent metal — bright gilt on the dark stage |
| `--hp` / `--sp` | `0.72 0.14 150` / `0.62 0.12 245` | vitals |
| `--radius` | `0.3rem` | crisp (§6) |
| `--sidebar` | `0.21 0.006 286` | rail = card tone |
| `--sidebar-primary` | `0.606 0.25 293` | brighter purple for the rail |

`--gold` is exposed as a Tailwind color (`--color-gold`) → `text-gold` /
`border-gold` / `bg-gold`.

> **Single-theme structure:** the dark values live directly in `:root` — there is no
> `.dark` block and no separate light block, so there's no cross-block inheritance to
> drift (the earlier footgun where `--gold`/`--hp`/`--sp` silently inherited light
> values). `next-themes` still applies a `.dark` class to `<html>` via
> `defaultTheme="dark"`, which is what keeps any `dark:` utility variants firing; the
> colors themselves come from `:root`.

---

## 4. Surface (dark-only)

There is **one surface: the darkened house.** Lights are always down.

Light mode ("the Playbill") was genuinely attempted — warm cream paper, ink, gilt
trim — across several iterations. It kept collapsing into a clean white SaaS app (a
*different* brand) and every fix pulled against the theater vibe; on a light ground
the gold also demotes to bronze. The conclusion: the brand's center of gravity is
dark, so the app **commits to dark-only** rather than maintain a second surface that
never wanted to exist. (Honest caveat: dark-only disadvantages bright-room / light-
sensitive users — acceptable here because it's a friends' game where the mood is the
point.)

---

## 5. Typography

Color sets the mood; **type sets the voice.** The dramatic display serif is rationed
to the *marquee*; everything else is a clean grotesque.

| Role | Face | Used for |
| --- | --- | --- |
| **Display** | **DM Serif Display** | the marquee only — chapter/page titles ("Corpus") and the **Showtime!** wordmark. High-contrast, theatrical, playbill/tarot. Display sizes only. |
| **Body / UI / headings** | **Hanken Grotesk** | the instrument — controls, descriptions, section + card headings. (`--font-heading` currently maps to the sans.) |
| **Numbers** | **JetBrains Mono** | stats, dice, HP/SP, tables — instant "stat block." |
| **Long prose** | **Source Serif 4** | reading-heavy surfaces (e.g. Explore). |

The deliberate **contrast between the ornate display serif and the clean grotesque
is the design move** — "theater poster meets control panel" — and it keeps the
display serif a *rare* event (marquee only) so it stays dramatic.

Wiring: `apps/web/app/layout.tsx` loads the faces; `--font-display` is DM Serif
Display.

---

## 6. Shape & motif

- **Crisp geometry.** `--radius: 0.3rem` — tight, editorial. Sharpness suits the
  display serif, Art Deco, and tarot cards; it's the deliberate move *away* from
  rounded generic-SaaS.
- **The gold-keyline signature.** A chosen/feature container — the selected card —
  earns a **thin gold keyline + an inset gold hairline + a gold celestial corner
  sparkle**, so it reads as a drawn tarot card. Selection and hover are **gold-led**
  (the sparkle is the selection mark; the old purple check pill was removed). Dense
  working UI stays plain-bordered.
- **Two icon registers** (mirrors the two fonts):
  - **Functional → Phosphor** — clean, neutral, for the instrument.
  - **Brand / content → celestial line motif** — the `Sparkle` (shipped at
    `components/shared/celestial.tsx`), starfield dividers, sigils, plus the game's
    four Spoils suits (Coins / Wands / Swords / Cups) and Major Arcana for
    Collaborators. Gold line on black. Custom suit/Arcana glyphs are future design work.
- **Elevation** (see Principle 5): lighter `card` tone + hairline border for resting
  surfaces; **shadow only on true overlays** (popover/dialog/dropdown/floating
  sidebar). Anchored panels (base sidebar, header) stay flat.

---

## 7. Motion

- **Reserved for the rare beats only.** The working UI is static and instant.
- **No nav/tab/page-transition animation** — too high-frequency; it ages instantly.
- **Rare beats get full theater:** level-up / Victory, a combat finisher, an Arcana
  reveal.
- **Signature moment (designed, not built): one reusable "curtain rises" treatment** —
  a spotlight / radiant burst, a display-serif title card in gold, one beat of motion,
  reused across all rare beats so it becomes *the* recognizable gesture. Flagship it
  on level-up. Always gated by `prefers-reduced-motion`.

---

## 8. In-fiction nomenclature (proposed — not yet implemented)

The "show business" identity reshaped the cooperative-finisher names. **Agreed in
principle, not built; the app doesn't yet track finisher availability (DM fiat).**

- **All-Out Attack → "Showtime!"** — the *ensemble* finisher (cooperative; whole
  party performs). P5's name on the P5-shaped mechanic. The table war cry — **and the
  system's own name** (§1): title and signature mechanic are one word.
- **Synthesis Skills → "Prime Time"** — the *solo* finisher: thread a Shift chain
  through every healthy party member in one turn; the closer alone unleashes their
  signature ultimate. P4's name on the P4-shaped mechanic (one star in the light ≈
  "face yourself"). Cast model: **single caster** (the chain is the cost).
- **Bard's old "Showtime!" skill → "Grand Finale"** — avoids colliding with the new
  All-Out-Attack name.
- **Optional:** rename **Shift → "passing the Spotlight."**

---

## 9. Implementation status

**Done (reference surface):**
- `apps/web/app/layout.tsx` — DM Serif Display (`--font-display`), Hanken Grotesk
  (`--font-sans`), JetBrains Mono, Source Serif 4.
- `packages/ui/src/styles/globals.css` — a **single `:root` dark theme** (no `.dark`
  block; `defaultTheme="dark"` in the provider); `--gold` token + `--color-gold`,
  brightened to gilt (`0.82`); crisp `--radius: 0.3rem`.
- `apps/web/components/builder/movements/corpus/` — DM-Serif marquee, gold-keyline +
  gold-sparkle selected card, purple selection, `components/shared/celestial.tsx`.
- `apps/web/components/shell/site-header.tsx` — the **Showtime!** wordmark (display
  serif italic + gold `Sparkle`).

**Open / next:**
- Build the celestial glyph set (suits, Arcana) and the "curtain rises" moment.
- The wordmark/logo can grow from the `Sparkle` / sun-sigil seed.
