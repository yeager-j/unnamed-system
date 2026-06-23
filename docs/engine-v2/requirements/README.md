# Engine v2 — v1 Requirements Inventory

An implementation-agnostic inventory of **what the v1 engine guarantees** — every
testable rule, behavior, and invariant `packages/game/src/engine/**` enforces.
Built to de-risk the v2 rewrite (decision log: `../decision-log.md`, O5): v2 must
satisfy these regardless of how it restructures the code. Each requirement is a
testable statement with a `source:` ref and `edge:` notes (flooring, clamping,
comparators, null handling, ordering).

This captures *behavior*, deliberately **not** a keep/modify/drop tagging of v1
code — the "does the v2 component model cover this, and where does it strain?"
gap analysis is a separate synthesis step against the decision log.

## How it was built

4 parallel subdomain extractors → 2 independent verification oracles (one walking
the **test suite**, one re-walking **source** for subtle numeric/ordering rules) →
2 gap-filling extractors for whole modules the first pass under-scoped. The two
oracles independently converged on the same missing modules, which is the
confidence signal that the inventory is reasonably complete.

## Files

| File | Domain | ~Count |
|---|---|---|
| `01-character-derivation.md` | Hydration, attributes, max HP/SP, affinity chart, leveling, virtues, reducer slices | ~95 |
| `02-combat-mechanics.md` | Attack rolls, damage/affinity, side effects, statblock derivation, **mechanics registry (9 mechanics)**, enemy hydration | ~95 |
| `03-encounter-tracker.md` | Session construction, turn drafting/initiative, advantage, action economy, end-of-turn, durations, enemy vitals, engagement, zones, fallen | ~80 |
| `04-views-redaction-dungeon.md` | View/rail/console shapers, **redaction field lists (player vs DM)**, reveal/fog, zone layout, party composition, dungeon turn loop | 72 |
| `05-rest-items-skills.md` | Rest (full/partial/respite), exhaustion table, item equip/stack/quantity, inventory resolution, **skill cost/cast comparators** | 41 |
| `06-atlas-inheritance-composition.md` | Lineage Atlas + recommendations, archetype display/preview, inheritance, affinity-base, rank/mastery gates, `createGameEngine`, map geometry | 56 |
| `_gaps-from-tests.md` | Verifier 1 — behaviors the test suite proves (supplementary) | ~40 |
| `_gaps-from-source.md` | Verifier 2 — subtle source rules (numeric/ordering/null) (supplementary) | ~48 |

## Cross-cutting findings that touch v2 decisions

See the O5 entry in `../decision-log.md` for how these land. Highlights:

- **`MechanicDefinition.transform` + `resetOn` are contract-only in v1** — declared,
  no call-site, JSDoc says reserved for "the future combat tracker / Shapeshifter
  Lineage." v1 already stubbed D8's seam.
- **Skill affordability asymmetry:** HP is strict `>` (a skill can never self-Fall
  the caster), SP is `>=`. %HP cost is `max(1, floor(maxHP*amt/100))`. (D9-adjacent.)
- **Redaction** (`player-snapshot.ts`): enemy `attributes`/`affinities` are
  *structurally absent* on the wire (not null) for player viewers. (O10.)
- **Enchantment:** only Toccata is engine-modeled; Requiem/Tarantella are prose-only
  today. (O11 / D8.)
- **Known non-goals v1 doesn't model:** per-source counter caps (Lumina/Tells)
  unenforced; ailment combat resolution (Technicals, saves) not modeled; exhaustion
  levels 1–6 are placeholder text (rulebook table unshipped).
