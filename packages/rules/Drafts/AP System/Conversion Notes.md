# AP System — Conversion Notes

Designer-facing notes for the SP → AP draft. Nothing in this folder replaces a
canonical file; every draft has an ` (AP)` suffix (or a new chapter name) so the
two systems can be read side by side. Compare:

| Current                                  | Draft                             |
| ---------------------------------------- | --------------------------------- |
| `1. Players/1. Character Building/1.1 HP and SP` | `Drafts/AP System/1.1 HP and AP` |
| `Archetypes/Thief`                       | `Drafts/AP System/Thief (AP)`     |
| `Skills/Mechanics/Thief's Insight`       | `Skills/Mechanics/Thief's Insight (AP)` |
| Feint, Cruel Attack, Flash Bomb, Memory Blow, Phantom Tracer | same names + ` (AP)` |

Auto-Sukukaja is transcluded unchanged — passives don't touch the resource
system, so most of the Skill catalog's passive entries convert for free.

## The Economy Baseline

- AP ranges **0–9**, capped at 9 (overflow is wasted — timing your spend is a
  universal decision).
- You start each combat at your **Starting AP** (2 / 3 / 4 by path; +1 at
  Levels 10 and 20).
- **Turn tick**: +1 AP at the start of each of your turns (per E33). This is
  the true floor — nobody is ever fully stalled, so Archetype mechanics and
  Skills never need to generate AP themselves; they can be pure accelerators
  and discounters.
- **Weapon attack**: +2 AP on hit, +1 on miss. The dependable way to build
  faster than the tick. Opportunity Attacks count (Reactions join the engine).
- **Follow-Ups & Shifts**: +1 AP when you gain a Follow-Up; +1 AP when a
  Follow-Up is Shifted to you. This is the parry-replacement — generation
  tied to the system's real skill axis (Affinity knowledge, Down sequencing,
  chain routing). Each chain link is a Down, so a full 4-person chain
  distributes ~+7 AP, and the receiver subsidy is what keeps a chain funded
  toward its Prime Time trigger. The Follow-Up +1 lands mid-turn, so the
  bonus action can afford a bigger Skill than the main action could.
- **Guard**: +1 AP. A "nothing to do" turn now banks something.
- **Ambush**: winning side starts with +2 AP each. This is deliberate: it makes
  a dungeon turn spent on Move Quietly convert into combat economy, keeping
  time the master resource.
- Archetype mechanics are **accelerators, not gatekeepers**: played well they
  should out-earn the baseline by roughly +1–2 AP per round, never replace it.

## Cost Mapping

From the Idea Board's SP table, priced in time-to-afford from a Balanced
start (3 AP, +1 tick each turn, +2 per weapon attack — so a build turn nets
+3 and even a casting turn nets the tick):

| Tier         | Old cost (Magical) | AP  | Affordable...                |
| ------------ | ------------------ | --- | ---------------------------- |
| Weak         | 4 SP               | 2   | turn 1; near-at-will         |
| Weak/Group   | 10 SP              | 3   | turn 1                       |
| Medium       | 8 SP               | 3   | turn 1                       |
| Medium/Group | 16 SP              | 4–5 | turn 1–2                     |
| Heavy        | 12 SP              | 5   | turn 2                       |
| Heavy/Group  | 24 SP              | 6–7 | turn 2, with a build turn    |
| Severe       | 48 SP              | 7   | turn 2, with a build turn    |
| Severe/Group | 54 SP              | 8   | turn 3                       |
| Colossal     | 99 SP              | 9   | turn 3, all-in — the arc     |

**HP costs are removed as the default physical price.** The physical/magical
cost split (% max HP vs. SP) was the system's caster/martial asymmetry in
mechanical form; AP is the same currency for everyone. HP costs remain
available as *flavor* on specific reckless Skills (a Berserker Skill costing
AP **and** blood), but they are no longer how physical damage is priced.

**Prime Time is fueled by party AP** — every party member pays the listed cost
(Phantom Tracer: 2 each). This replaces the "party pays SP" clause and gives
Prime Time the ephemeral, party-pooled shape of E33's Gradient: the Shift
chain builds it, the whole table pays for it, and it can't be pre-banked
across fights.

## Thief Conversion Decisions

The Thief was chosen because its current kit is billed in two currencies
(Feint/Cruel Attack cost %HP; Flash Bomb/Memory Blow cost SP) — it
demonstrates the unification on a single sheet.

- **No generator Skills.** With the per-turn tick guaranteeing flow, the
  Thief's mechanic doesn't need to produce AP — it *discounts* it. Study is
  unchanged from the original; its cost is the foregone weapon-attack AP,
  which is exactly the investment-vs-tempo game we want.
- **Marked Prey (new)**: Skills cost 1 less AP (min 1) against a target with
  3+ Tells. Tells are now an economic engine, not just an accuracy bonus —
  and Suspicion busting your Tells busts the discount too, so the
  push-your-luck game gets sharper without a new rule.
- **Feint** is the original card verbatim, priced at 2 AP (Weak single). With
  the tick, it's near-at-will — the bread-and-butter Tell farmer.
- **Cruel Attack** at 3 AP is affordable from a Balanced start on turn 1 —
  intentionally, since it's the Follow-Up payoff Skill and should be castable
  the moment someone Downs an enemy.
- **Memory Blow** at 2 AP is the cheap probe; its 4+ Tell steal is the
  long-game payoff.

## Open Tuning Questions

1. Is the total economy too rich? Tick (+1) plus weapon attack (+2 hit /
   +1 miss) means a build turn nets +3; Severe Skills come online by turn 2.
   If fights snowball, the first knob to turn is weapon generation (drop to
   +1 hit / 0 miss), not the tick.
2. Is Marked Prey's threshold (3 Tells) right for a Rank-cap of 5 Tells?
3. Phantom Tracer at 2 AP per member — too cheap mid-Shift-chain, when the
   party has already been spending to generate the Downs? Playtest.
4. Path differentiation: is Starting AP 2 vs. 4 a big enough hook to carry the
   creation choice, or does the AP path need a second knob (e.g., +1 AP cap)?
5. The Follow-Up/Shift engine inverts parry availability: parries paid most
   in hard fights; Follow-Ups pay most in solved ones. Down-immune or
   Weakness-less bosses silence the skill-expression channel right when fuel
   matters most. Candidate second outlet: **Technicals grant +1 AP** (same
   knowledge axis, works on most bosses, gives ailment builds a generation
   seat). Avoid evasion-based generation (+1 on enemy miss) — passive, no
   choice attached, turns Sukukaja stacking into an AFK engine.
6. Enemy-side AP: recommend monsters don't track AP at all — their Skill
   budgets are designed into the stat block (as in E33). Otherwise DM
   bookkeeping triples and enemy Downs feed an enemy economy nobody enjoys.
7. Not yet drafted, needed for a full migration: Despair (SP drain → AP
   drain), Forget ("costs HP or SP" → "costs AP"), Purple Prisma (delete or
   repurpose), Partial Rest's Skill-Dice clause (dead text under AP; see the
   Hit-Dice-battery proposal), and the 2.2 dungeon-turn retune (15–20 min
   turns, 24–36 per day).
