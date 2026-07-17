# Knowledge folds now; the Place model is the recognized evolution

**Status:** accepted (2026-07-16)

Procedural dungeons (docs/procedural-dungeons/) ships on today's ephemeral spatial model —
per-run MapInstances, cross-expedition memory carried as two Region folds (`discoveredSiteKeys`,
`staticReveal`) — even though we've identified a deeper model we believe in: the **Place model**,
where the campaign world is real. We chose the folds because the Place model does not make this
feature cheaper — Drakkenheim's reshuffle is the *exception* to persistent places (ephemeral
instances give it for free; persistent places make it a world-event with sweep/re-stamp machinery)
— and because the feature is review-hardened today while Places is conversation-grade.

## The Place model (target, unscheduled)

The current schema conflates four lifetimes in two nouns. Bottom-up, there are five:

| Noun | Fiction | Lifetime |
|---|---|---|
| **Blueprint** (`map`) | the architect's drawing | user, campaign-agnostic (unchanged) |
| **Place** | the physical location; a broken wall stays broken | campaign |
| **Delve** (`dungeon`) | the visit: clock, roster, occupancy | run |
| **Chart** | what the party has mapped of a place | campaign — fog is knowledge about the *observer*, not state of the world |
| **Encounter** | an event; freezes its spatial witness at end, because the world moves on | historical |

Stamping a blueprint creates a place; thereafter the place is the authority (re-stamping is an
explicit world operation, never a sync). `startDelveAction`'s state wipe is the one line where
the ephemerality assumption lives today. Staged migration, each step valuable alone:
(1) continue-delve start variant (serial instance reuse — covers megadungeons, and is the demand
probe for the rest); (2) encounter freeze-at-end (fixes a drift that already exists within single
runs); (3) flip the default — stop wiping, `mapInstance` → `place`, reveal moves to the chart.

## Escrow contracts on the shipping feature

- **`staticReveal` is a chart in escrow.** `fold.ts` is its only touchpoint: the write
  folds at expedition finish; the applies happen at expedition start (seed Map) **and at
  portal graft** (static Maps), both routed through the same module. Retirement = seed
  the chart from it.
- **Closure provenance rider (P3):** `closeLoop` must stamp its connection into a
  generated-connections record from day one — a closure between two *authored* zones has no
  generated endpoint, and the future Haze world-event can't otherwise identify it for deletion.
- **Regions survive the rework with product semantics invariant** (reshuffle, checklist,
  discovery, persistent castle mapping, stable watch link). The Region sharpens into pure law —
  "this place reshuffles by this set" — gaining a `placeId` (the 2026-07-08 persistent-instance
  instinct, correct once visit-state and knowledge have proper homes), dropping `staticReveal`,
  keeping `discoveredSiteKeys` (the one fold no chart can absorb: its referents are destroyed by
  the reshuffle). Migration: stamp the city place from the seed; graft charted static Maps in
  unstitched; completed expeditions keep their per-run instances as naturally frozen history.

Full product/technical design for Places is deliberately deferred until play evidence (or heavy
continue-delve use) demands it.
