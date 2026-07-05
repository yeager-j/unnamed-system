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
- **Weapon attack**: +2 AP on hit, +1 on miss. This is the dependable floor —
  no Archetype mechanic is ever the *only* way to afford Skills.
- **Guard**: +1 AP. A "nothing to do" turn now banks something.
- **Ambush**: winning side starts with +2 AP each. This is deliberate: it makes
  a dungeon turn spent on Move Quietly convert into combat economy, keeping
  time the master resource.
- Archetype mechanics are **accelerators, not gatekeepers**: played well they
  should out-earn the baseline by roughly +1–2 AP per round, never replace it.

## Cost Mapping

From the Idea Board's SP table, priced in rounds-to-afford from a Balanced
start (3 AP, +2 per weapon attack):

| Tier         | Old cost (Magical) | AP  | Affordable...                |
| ------------ | ------------------ | --- | ---------------------------- |
| Weak         | 4 SP               | 2   | immediately                  |
| Weak/Group   | 10 SP              | 3   | immediately                  |
| Medium       | 8 SP               | 3   | immediately                  |
| Medium/Group | 16 SP              | 4–5 | after ~1 build turn          |
| Heavy        | 12 SP              | 5   | after ~1 build turn          |
| Heavy/Group  | 24 SP              | 6–7 | after ~2 build turns         |
| Severe       | 48 SP              | 7   | after ~2 build turns         |
| Severe/Group | 54 SP              | 8   | after ~3 build turns         |
| Colossal     | 99 SP              | 9   | full bank — the whole arc    |

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

- **Study now grants 1 AP** alongside the Tell. The Rank-1 turn is a genuine
  three-way choice: weapon attack (2 AP + damage), Feint (damage + Tells,
  worse AP), or Study (Tell + 1 AP, no damage). Investment vs. tempo.
- **Marked Prey (new)**: Skills cost 1 less AP (min 1) against a target with
  3+ Tells. Tells are now an economic engine, not just an accuracy bonus —
  and Suspicion busting your Tells busts the discount too, so the
  push-your-luck game gets sharper without a new rule.
- **Feint** costs 1 AP and refunds 2 on an `11+` Attack Roll. It's the kit's
  generator-Skill — slightly worse expected AP than a weapon attack, in
  exchange for Tell generation on the same action.
- **Cruel Attack** at 3 AP is affordable from a Balanced start on turn 1 —
  intentionally, since it's the Follow-Up payoff Skill and should be castable
  the moment someone Downs an enemy.
- **Memory Blow** at 2 AP is the cheap probe; its 4+ Tell steal is the
  long-game payoff.

## Open Tuning Questions

1. Are hit/miss generation rates (2/1) right, or should a miss generate 0?
   (Current draft softens whiff-punishment; pure E33 would be hit-only.)
2. Is Marked Prey's threshold (3 Tells) right for a Rank-cap of 5 Tells?
3. Phantom Tracer at 2 AP per member — too cheap mid-Shift-chain, when the
   party has already been spending to generate the Downs? Playtest.
4. Path differentiation: is Starting AP 2 vs. 4 a big enough hook to carry the
   creation choice, or does the AP path need a second knob (e.g., +1 AP cap)?
5. Not yet drafted, needed for a full migration: Despair (SP drain → AP
   drain), Forget ("costs HP or SP" → "costs AP"), Purple Prisma (delete or
   repurpose), Partial Rest's Skill-Dice clause (dead text under AP; see the
   Hit-Dice-battery proposal), and the 2.2 dungeon-turn retune (15–20 min
   turns, 24–36 per day).
