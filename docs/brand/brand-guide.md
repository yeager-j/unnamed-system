# Brand Guide — Showtime!

> Status: **working draft** (first surface migrated — the Corpus builder movement).
> The system is named **Showtime!** — also the name of its signature finisher (§8).
> The title and the table war cry are the same word, by design.

This is the canonical reference for the app's visual identity and the reasoning
behind it. It supersedes the old "literary/neutral" look — a warm paper-and-ink
manuscript that was a fine *placeholder* identity for an unnamed game, but had no
point of view about what the game actually is.

---

## 1. Positioning

**The strategic call: lean all the way into the Persona DNA — don't be another
serious fantasy system.** Serious traditional fantasy is the most crowded shelf in
the hobby (D&D owns the mainstream, Pathfinder the crunch, Draw Steel the tactical
lane). "The stylish, upbeat, tarot-soaked JRPG you play at the table" is a wide-open
niche with no flagship. We define a category instead of placing fifth in one.

**Tone: upbeat and fun, not grim.** The game is a celebration, not a dirge.

**The unifying concept: _show business_.** The designer loves Persona 3, 4, and 5
equally and won't crown a favorite. Their palettes and motifs clash (P5 acid-red
stage, P4 pop-yellow TV, P3 cool-blue concert). "Show business" is the umbrella that
contains all three — stage, screen, and concert hall are all departments of one
industry — so it honors every game without one dominating. It's also thematically
load-bearing: a **Persona is a performed self** (the face you wear for the audience),
and show business is the business of performing identities. The **Chains** mechanic
(facing the self behind the performance — pure Persona 4) is the dark underbelly of
that idea: growth is dropping the act.

**The brand in one line:**

> **A mystical theater** — show business meets the tarot table. The Velvet Room
> reimagined as a stage: purple velvet, gold gilt, a black house scattered with stars.

**The name: _Showtime!_** The system is named after its signature mechanic — the
All-Out Attack (§8) — fulfilling the original design instinct to "name the system
after the most exciting moment." The table war cry *is* the title: every time a
player shouts "Showtime!" to trigger the all-party finisher, the game says its own
name. Title and signature mechanic sharing one word is intentional.

The tarot anchor is not decoration — it's the game's own content. Arcana,
Collaborators-by-Major-Arcana, and the Spoils deck are already tarot. The reference
object is a black-and-gold celestial tarot deck: thin gold line-work on matte black.

---

## 2. Principles

These are the rules that decide the hundred small questions the guide doesn't
enumerate. When in doubt, return here.

1. **Branded chrome, calm core.** This is a *tracking tool*, read for hours at a
   table, not a title screen glimpsed for seconds. The brand lives in the **frame**
   (marquee, headers, the rare celebratory moments) and the **working data stays calm
   and legible.** A spotlight only reads as bright because the rest of the stage is
   dark.
2. **Set the tone; don't compete.** The game is played in person. The app is the
   theater lobby that sets the mood before the curtain — never video-game graphics
   fighting for attention mid-session.
3. **Restraint is the luxury.** Generic-SaaS minimalism is not the enemy of this
   brand — it's the *discipline* that keeps it from going gaudy. A little gold on a lot
   of clean reads as expensive; a lot of gold reads as a costume shop. The clean core
   is the canvas; the theater is precise, rationed gestures on top.
4. **Gold is a dark-mode hero and a light-mode garnish.** Gold's "gold-ness" needs
   mid-to-light luminance and a warm sheen. Forced to pass contrast as text on cream
   it darkens to burnt-amber/bronze and reads as brown. So gold is **never a functional
   UI color** — decorative metal only. It blazes on the dark "house" and demotes to
   quiet bronze trim on the light "playbill."
5. **Motion budget scales inversely with frequency.** High-frequency interactions
   (nav, tabs, panels, toggles) are **instant** — animate them and they go from
   delightful to in-the-way within a day. Rare beats (level-up, finisher) get the
   full theater. Always honor `prefers-reduced-motion`.
6. **Two registers, enforced by the toolkit.** Fonts and icons each split into an
   ornate *brand voice* and a clean *instrument voice*. The split is structural, not
   case-by-case — it's what makes Principle 1 automatic.

---

## 3. Color

**Roles:** **purple = hero** (the owned brand color, the working primary),
**gold = precious accent** (decorative metal, rationed), **black/aubergine = the
stage** (the ground).

**Why purple?** It's the color the designer loves and had never gotten to use; no
Persona game owns it (P5 red / P4 yellow / P3 blue all sit elsewhere), so it honors
all three; it's deeply theatrical (velvet, royalty) and occult (twilight, the
cosmic) — the natural binder of tarot and theater; and it's a *continuation*, not a
rupture, since the old primary was already a muted blue-violet. Purple is also far
more **versatile** than gold: it can hit accessible contrast in both modes while
still reading as purple.

**Surfaces are mode-split** (see §4): light = **playbill cream**, dark = **aubergine
theater**. Both are first-class.

**HP green / SP blue / destructive red are preserved** — semantic clarity on the
numbers that matter beats theme. They're only nudged to sit politely beside purple.

### Tokens (current, in `packages/ui/src/styles/globals.css`)

OKLCH. Hero hue is ~300 (royal purple); gold hue ~78–85; paper/ink hue ~88.

| Token | Light (playbill) | Dark (theater) |
| --- | --- | --- |
| `--background` | `0.972 0.013 88` (cream paper) | `0.165 0.022 300` (aubergine-black house) |
| `--foreground` | `0.235 0.02 300` (aubergine ink) | `0.92 0.012 88` (warm off-white) |
| `--card` | `0.988 0.009 88` | `0.215 0.025 300` |
| `--primary` | `0.45 0.17 300` (royal purple) | `0.7 0.16 300` (brighter purple) |
| `--primary-foreground` | `0.985 0.01 88` | `0.16 0.02 300` |
| `--accent` | `0.92 0.03 305` (soft purple tint) | `0.3 0.04 305` |
| `--border` / `--input` | `0.88 0.015 88` | `0.8 0.05 300 / 18%` |
| `--ring` | `0.45 0.17 300` | `0.7 0.16 300` |
| `--gold` | `0.6 0.1 78` (antique bronze) | `0.82 0.13 85` (true metal) |
| `--hp` | `0.72 0.14 150` | `0.6 0.13 150` |
| `--sp` | `0.62 0.12 245` | `0.6 0.12 245` |
| `--destructive` | `0.5 0.19 25` | `0.68 0.17 25` |
| `--radius` | `0.25rem` (crisp) | — |

`--gold` is exposed as a Tailwind color (`--color-gold`), enabling
`text-gold` / `border-gold` / `bg-gold` and opacity variants.

---

## 4. Surface & light/dark

The two modes are not an invert — they're **raising and lowering the house lights**,
and both are designed as hero surfaces.

- **Light = the Playbill.** The everyday reading surface, reframed from "literary
  manuscript" to *theater program*: warm cream stock, ink text, purple-and-bronze
  gilt trim. Calm, dense-text-friendly, protects long-session legibility.
- **Dark = the House.** Lights down: the black-and-gold tarot deck in full force —
  aubergine ground, gilt line-work at full metal, purple at its brightest.

---

## 5. Typography

Color sets the mood; **type sets the voice.** Three+ roles, enforced as a system.

| Role | Face | Used for | Rule |
| --- | --- | --- | --- |
| **Display** | **Bodoni Moda** (Didone) | marquee, page titles, Arcana names, card titles, finisher splashes | The brand voice. The typeface of playbills, fashion, and premium tarot. **Display sizes only** — its hairlines turn spindly and unreadable small. Never body. |
| **Body / UI** | **Geist** (sans) | every working surface — controls, descriptions, the tool | The instrument. Sans is the register of dashboards and things you *operate*. |
| **Numbers** | **JetBrains Mono** | stats, dice, HP/SP, tables | Tabular mono reads instantly as "stat block" and separates figures from prose. |
| **Long prose** | **Source Serif 4** | rules text, reading-heavy surfaces (e.g. Explore) | Retained for genuinely literary long-form reading. |

The deliberate **contrast between ornate Didone and clean Geist is itself the design
move** — "theater poster meets control panel." It makes Principle 1 (branded
chrome / calm core) automatic at the type level.

Wiring: `apps/web/app/layout.tsx` loads the faces; `--font-heading` is repointed to
`--font-display` (Bodoni) in `globals.css`. Candidate swap if Bodoni reads too thin:
**Playfair Display** (softer, sturdier transitional Didone).

---

## 6. Shape & motif

- **Crisp geometry.** Keep tight corners (`--radius: 0.25rem`). Sharpness suits
  Didone, Art Deco theater, and tarot cards alike.
- **The gold-keyline signature.** Brand/feature containers — a chosen card, the
  marquee, a finisher panel, an Arcana card — earn a **thin gold keyline + an inset
  hairline + a small celestial corner flourish**, so a card literally feels like a
  drawn tarot card. The dense working UI stays plain-bordered. The frame is a reward
  spent only where it counts; in the Corpus page it marks the **chosen Origin**.
- **Two icon registers** (mirrors the two-font split):
  - **Functional → Phosphor.** Clean, neutral, for the instrument.
  - **Brand / content → celestial line motif.** Drawn from the tarot deck: a
    four-point **sparkle** (shipped as `Sparkle`), starfield dividers, sigils for
    empty states, a radiant burst for rare moments — plus the game's own **four
    Spoils suits** (Coins / Wands / Swords / Cups) and **Major Arcana** for
    Collaborators. Gold-on-black in dark; ink/purple line in light.
  - Deploy with discipline: one motif per surface, lots of negative space, never
    illustrated scenes.
- **Custom glyph work is real, future design work** — the suits and Arcana need
  bespoke glyphs, not off-the-shelf icons.

---

## 7. Motion

- **Reserved for the rare beats only.** The working UI is static and instant.
- **No nav/tab/page-transition animation** — too high-frequency; it ages instantly.
- **The rare beats get full theater:** level-up / Victory, a combat finisher, an
  Arcana / Collaborator reveal.
- **Signature moment (designed, not yet built): one reusable "curtain rises"
  treatment.** House lights drop, a spotlight / radiant celestial burst ignites, a
  Didone title card rises in gold over purple, one beat of motion, then back to work.
  Reuse the same grammar across all rare beats (only the words and the sigil change)
  so it becomes *the* recognizable brand gesture. **Flagship it on level-up** — the
  beat every player hits inside the app — not the combat finisher (which lives in the
  encounter surfaces). Always gated by `prefers-reduced-motion`.

---

## 8. In-fiction nomenclature (proposed — not yet implemented)

The "show business" identity also reshaped the names of the cooperative finishers.
**These are agreed in principle but not built; the app doesn't yet track finisher
availability (currently DM fiat).** Mechanics to be finalized separately.

- **All-Out Attack → "Showtime!"** — the *ensemble* finisher (cooperative; whole
  party performs). P5's name on the P5-shaped mechanic. Doubles as the table war cry —
  **and as the system's own name** (§1): title and signature mechanic are one word.
- **Synthesis Skills → "Prime Time"** — the *solo* finisher: thread a Shift chain
  through every healthy party member in one turn, and the closer alone unleashes their
  signature ultimate. P4's name on the P4-shaped mechanic (one star in the light ≈
  "face yourself"). Cast model resolves to **single caster** (the chain is the cost).
- **Bard's old "Showtime!" skill → "Grand Finale"** — it would otherwise collide
  with the new All-Out-Attack name. ("Finale" lives in every register.)
- **Optional flourish:** rename **Shift → "passing the Spotlight"** — you pass the
  light down the chain until it lands on someone's Prime Time. Teaches the rule in its
  own name.

Mapping each game's title onto the finisher that embodies its soul — **Showtime!**
(P5, the team) and **Prime Time** (P4, the self) — is the umbrella doing its job:
intentional variety within one industry, not mixed metaphors.

---

## 9. Implementation status

**Done (reference surface):**
- `apps/web/app/layout.tsx` — Bodoni Moda added as `--font-display`.
- `packages/ui/src/styles/globals.css` — `--font-heading` → Didone; `--gold` token +
  `--color-gold` utility; light/dark recolored to playbill/theater; HP/SP harmonized.
- `apps/web/components/builder/movements/corpus/` — Didone card titles, gilded
  selected card, purple selection, `celestial.tsx` (`Sparkle`) on section headers.

Theme + fonts are **global**, so every surface already inherits the palette and
faces; only the Corpus page has had its component-level treatment hand-applied.

**Open / next:**
- **The system is named _Showtime!_** The open piece is now the **wordmark/logo** — a
  Didone "Showtime!" lockup is the obvious starting point, with the `Sparkle` /
  sun-sigil as the mark seed.
- Decide how loud **light mode** gets (warmer paper? faint gold wash on selected?).
- A/B **Bodoni Moda vs Playfair Display** for the display face.
- Propagate the system to the next surface; build the celestial glyph set and the
  "curtain rises" moment when their surfaces arrive.
