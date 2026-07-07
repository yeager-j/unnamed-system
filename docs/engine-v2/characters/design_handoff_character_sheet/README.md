# Handoff: Character Sheet — Combat Tab

## Overview
A tablet-first (landscape) character sheet for **Showtime!**, a Persona-inspired
tabletop RPG. The sheet is organized into four context tabs — **Combat · Explore ·
Inventory · Archetypes** — sharing one persistent left rail and a bottom tab dock.

This checkpoint delivers the **Combat tab** fully resolved, plus the reusable
**Skill Card** component. The other three tabs are intentionally unbuilt (see
"Not Yet Designed"). The sheet is a **tracker**, not a rules engine: it *displays*
vitals and *calculates* attack-roll modifiers and damage dice, but never rolls or
enforces outcomes.

## About the Design Files
The files in this bundle are **design references created in HTML** — prototypes that
show the intended look and behavior. They are **not production code to copy directly**.
They are authored as "Design Components" (a streaming HTML+JS format) and load a bundled
design system; that harness is a prototyping convenience, not part of the deliverable.

Your task is to **recreate these designs in the target codebase's existing environment**
(React/Vue/SwiftUI/etc.) using its established components, tokens, and patterns. If no
front-end environment exists yet, pick the most appropriate framework and implement there.
The game already has a **Showtime! design system** (dark theme, indigo primary, gold
accent, HP/SP vitals) — use its real components rather than reproducing the CSS here.

## Fidelity
**Mixed, leaning high-fidelity for the Skill Card; mid-fidelity for the frame.**
- **Skill Card** — high-fidelity: final layout, element color system, typography,
  spacing, and the merged "D20 +N" roll header. Recreate faithfully.
- **Overall frame (rail, tabs, affinity strip)** — mid-fidelity: the layout, hierarchy,
  and interactions are settled, but treat colors/spacing as "apply your design system"
  rather than pixel-copy. Structure and behavior are the important part.

---

## Layout — the shared frame
Landscape tablet, two-handed / propped. Target canvas ~1180×800 (scale fluidly; it is a
tablet app, not a fixed artboard).

```
┌───────────────────────────────────────────────────────────┐
│ ┌───────────┐ ┌───────────────────────────────────────┐   │
│ │           │ │  AFFINITY STRIP (11 damage types)     │   │
│ │  LEFT     │ ├───────────────────────────────────────┤   │
│ │  RAIL     │ │                                       │   │
│ │  (persist)│ │  TAB CONTENT (Combat shown)           │   │
│ │  ~300px   │ │  — Skill card grid, 3 columns         │   │
│ │           │ │                                       │   │
│ └───────────┘ └───────────────────────────────────────┘   │
│ ┌───────────────────────────────────────────────────────┐ │
│ │  BOTTOM DOCK: Combat · Explore · Inventory · Archetypes│ │
│ └───────────────────────────────────────────────────────┘ │
└───────────────────────────────────────────────────────────┘
```

- **Left rail** is persistent across all tabs (identity, vitals, controls, mechanic).
- **Bottom dock** holds the four context tabs, thumb-reachable in a two-handed hold.
- **Affinity strip** sits atop the content column (it is combat-relevant; may become
  tab-specific later).

---

## The Left Rail (persistent, ~300px)
Top to bottom:

1. **Identity**
   - Character name — display serif, ~20px.
   - **Pronouns** — muted, ~12px, directly under the name. *Optional* (omit if unset).
   - Row of pills: `Lv {level}` and the **Archetype pill** `{Archetype} · Rk {rank} ▼`.

2. **Archetype pill = Switch Archetype control.** Tapping it opens a popover menu listing
   available Archetypes, each with its **mechanic name** as a hint
   (Knight→Valor, Mage→Stains, Warrior→Perfection, Priest→Litany). Selecting one sets the
   active Archetype. (Switching is cross-domain; it lives in the rail so it's reachable
   from any tab. Real rules gate switching to a Respite — enforce per game rules.)

3. **HP bar** and **SP bar** — display-only. Label + `current / max`, colored fill
   (`--hp` green, `--sp` blue). No inline editing here.

4. **Victories bar** — a thin **7-segment gold bar** (visually consistent with the Valor
   gauge). Label: `{n} / 7 · {7−n} to level up`. At 7 victories the character levels up
   (increment level, reset victories to 0). Display-only here; awarding is a control.

5. **Controls** — a 2×2 button group:
   - **Adjust HP** → opens popover: number input + **Heal** / **Damage** buttons.
   - **Adjust SP** → opens popover: number input + **Restore** / **Spend** buttons.
   - **Rest** → immediate: restore HP and SP to max.
   - **Victories** → opens popover: **+ Award Victory** and a **−** decrement.
   Only one popover open at a time; the active button is highlighted.

6. **Attributes** — 4-cell row: **St / Ma / Ag / Lu**, each showing its signed modifier
   (e.g. `+2`, `−1`, `0`).

7. **Mechanic widget** — Archetype-specific. For the **Knight** this is the **Valor**
   gauge (see below). *Each Archetype needs its own widget here.*

8. **Prisma** — the healing flask: shows heal dice (e.g. `2d8+4 HP`), charge pips
   (filled circles), and a charge count + action cost.

### Valor widget (Knight's mechanic — reference implementation)
- Header: `Valor` + big current value `{n}/7` in gold.
- A 7-segment gold gauge (segments filled = current Valor).
- A 5-row threshold ladder; each row `{tier}+  {benefit text}`. Rows at or below current
  Valor are active (gold number, full-opacity text); rows above are dimmed (~42% opacity).
  Thresholds and benefits (Knight):
  - `1+` Opportunity hit (11+) cancels the target's Move
  - `2+` Enemies must save to Disengage from you
  - `3+` Resist Slash, Pierce & Strike
  - `4+` Not Downed when struck on your Weakness
  - `5+` Opportunity hit (20+) Downs the target
- Valor rating = combined levels of Engaged enemies (set by the combat system, not typed
  here). This widget is **display**; the number comes from game state.

---

## The Skill Card (high-fidelity — recreate precisely)
Portrait "Banner" card, shown in a **3-column grid** in the Combat tab. One card per
skill. Skills are NOT grouped by source (archetype / inheritance / equipment all mix).

**Structure (top → bottom):**
1. **Banner header** — tinted with the skill's *element hue* (radial glow top-right +
   subtle diagonal hatch + a large faint element glyph watermark).
   - **Type chip** (top-left): element + physical/magic class, e.g. `ELEC · PHYS`,
     mono, uppercase, on a translucent white pill, with the element glyph.
   - **Cost coin** (top-right): circular, `{n}` over `{HP|SP}`, e.g. `4 / SP`.
   - **Skill name** — display serif, ~21px.
2. **Description** — one line, muted.
3. **Meta chips** — `Cost {n SP|% HP}`, `Range {…}`, and **`Targets {n}` only when the
   skill hits more than one target** (omit for single-target — it's redundant).
4. **Damage ladder** (attack skills only) — a bordered table:
   - **Header row**, tinted with the element hue: left cell = **`D20 + {N}`** (the
     attack-roll modifier, in the element hue), then `DAMAGE`, then `EFFECT`.
     The `D20 + N` label must **never wrap** — keep it one line.
   - Three tier rows keyed to the d20 result: `1–10`, `11–19`, `20+`, each with its
     damage dice and an optional effect tag (Burn/Shock/Crit/Sukunda/…).
   - The `20+` (crit) row is **de-emphasized** (no fill, muted range label) so it doesn't
     compete with the gold header; the effect tag carries the emphasis.
   - The attack-roll breakdown (e.g. `Strength +2 · Perfection S +4`) is hidden in a
     **tooltip** on the ladder (title attr) to save space — surface it on hover/long-press.
5. **Effect line** — `{source} — {text}`, where source is the Archetype/Inheritance the
   effect comes from (e.g. `Knight —`, `Inherited · Mage —`).
6. **Use Skill** button — full-width, secondary style.

**Support (non-attack) skills** skip the D20 header and damage ladder entirely; they show
description, meta, and the effect line.

**Element color system** (used for hue + glyph per card):
| Element | Hue (oklch) |
|---|---|
| Fire | `oklch(0.68 0.19 40)` |
| Ice | `oklch(0.78 0.12 220)` |
| Elec | `oklch(0.82 0.15 96)` |
| Wind | `oklch(0.78 0.15 160)` |
| Slash | `oklch(0.63 0.2 22)` |
| Strike | `oklch(0.70 0.16 55)` |
| Pierce | `oklch(0.80 0.14 88)` |
| Support | `oklch(0.72 0.10 235)` |

Glyphs are Phosphor-style icons (lightning, flame, snowflake, wind, etc.) rendered as CSS
masks so they inherit the hue. Use your icon library's equivalents.

---

## Interactions & Behavior
- **Tab switching** — bottom dock swaps the content column; the rail persists.
- **Archetype pill** — tap toggles the switch menu; selecting an item sets active
  Archetype + rank and closes the menu.
- **Controls popovers** — Adjust HP / Adjust SP / Victories each toggle a popover;
  opening one closes others. Rest applies immediately.
- **HP/SP math** — Heal/Restore adds, Damage/Spend subtracts, clamped to `[0, max]`.
- **Victories** — Award increments; at 7 it rolls over (level +1, victories → 0).
  Decrement clamps at 0.
- **Skill card** — static in the resolved design (no expand/collapse; cards render at a
  comfortable size in 3 columns). Tapping **Use Skill** is where combat-system
  integration would hook in.
- **Tooltip** — attack-roll breakdown appears on hover of the ladder.

## State Management
Per-character, persisted:
- `hp`, `maxHp`, `sp`, `maxSp`
- `level`, `victories` (0–7)
- `activeArchetype`, `rank` (and the set of known Archetypes + ranks)
- `attributes` { St, Ma, Ag, Lu } (signed modifiers)
- `skills[]` — each: name, element, typeLabel, kind (`attack`|`support`), cost,
  range, targets, description, toHit (modifier), toHitBreakdown, tiers[{range, dice, tag}],
  effectSource, effectText
- `affinities` — per damage type: `weak | resist | neutral | (null)`
- mechanic state (e.g. `valor`, or the active Archetype's equivalent) — usually **driven
  by the combat system**, displayed read-only here
- `prisma` { healDice, charges, maxCharges }

UI-only state: which control popover is open, whether the Archetype menu is open.

## Design Tokens (from the Showtime! design system — use the real ones)
Semantic tokens referenced: `--background`, `--card`, `--popover`, `--secondary`,
`--muted-foreground`, `--foreground`, `--border`, `--input`, `--primary`,
`--primary-foreground`, `--hp` (health/green), `--sp` (spirit/blue), `--gold` (accent —
ration it: Valor, Victories, marquee moments only). Radius scales off `--radius`.
Type: body/UI = Hanken Grotesk (`--font-sans`); display serif = DM Serif Display
(`--font-display`, marquee titles only). Element hues are listed in the Skill Card section.

## Affinity strip
11 damage-type cells (Slash, Pierce, Strike, Fire, Ice, Wind, Elec, Soul, Mind, Light,
Dark). Each: type label + affinity mark. **Weak** cells are tinted with the destructive
color; **Resist** cells with a cool/blue tint; neutral shows a dash.

## Not Yet Designed (roadmap)
These tabs are stubbed and need design before implementation:
- **Explore** — Virtues & Talents (Talent Tests), Knives & Chains, Identity
  (Personality/Hopes/Dreams/Fears/Secrets), Sparks tracker, Backstory & notes.
- **Inventory** — Gold/currency, equipment, Prisma upgrades, spoils.
- **Archetypes** — active Archetype detail + its mechanic; inheritance slots; affinities
  granted. (A separate Lineage-tree screen already exists and is out of scope here.)

Open question for later: when the active Archetype changes, the rail's **mechanic widget**
must swap to that Archetype's widget (Valor is the only one built so far).

## Files
- `Character Sheet.dc.html` — the full sheet. The resolved Combat tab is the option
  badged **`10a`** ("Combat — resolved"). Earlier badges (1a–9a) are exploration history
  showing how the layout and card were arrived at — useful for rationale, not the target.
- `SkillCard.dc.html` — the reusable Skill Card component (Banner + Spine variants;
  **Banner** is the chosen default).

> Note: these are Design-Component HTML files. Open them in a browser to view. The
> `10a` frame is the source of truth for the Combat tab; read `SkillCard.dc.html` for the
> exact card structure and the element hue/glyph registry.
