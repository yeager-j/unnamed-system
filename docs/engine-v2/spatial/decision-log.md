# Decision log — Engine v2, the Map-Instance Spatial Subsystem (Tier 3)

Chronological rationale for the spatial layer, **SD1–SD12**, sibling to the combat
layer's `CD1–CD23` ([`../combat/decision-log.md`](../combat/decision-log.md)) and the
parent `D1–D45` ([`../decision-log.md`](../decision-log.md)). The clean current-state
synthesis is [`ADR.md`](./ADR.md); where it cites `SD<n>` the chronological reasoning
lives here.

This layer is the **internals the combat seam already reads.** The combat ADR pulled a
narrow read seam forward (`CD13–CD17`) and recorded the spatial-side confirmations it
needed as open questions `Q8`/`Q10`/`Q11`; this log **closes** them. Nothing here
relitigates a `CD13–CD17` commitment — they are fixed inputs.

---

## SD1 — Residency: a `spatial/` domain folder in `game-v2`, not a package, not the app · **Settled** (closes the UNN-513 a/b/c residency)

UNN-513 left the spatial-reducer residency as an a/b/c choice for the internals spike.
Resolved: **(a) a new `packages/game-v2/src/spatial/` domain folder**, a sibling of
`encounter/`, `combat/`, `mechanics/`. The other two are non-starters:

- **(b) a sibling package `packages/game-v2-spatial`** contradicts **D32** (v2 is *one*
  independent successor package) and **D33** (domain-first *folders*, one per domain). A
  spatial domain is a folder exactly like every other domain; a second package buys
  nothing and turns the kernel-vocab sharing (SD3) into a cross-package dependency
  instead of the `kernel → domain` gradient the existing lint already governs.
- **(c) an app-layer reducer in `apps/web`** violates the standing rule *"never put game
  logic in the UI layer."* `reduceMapInstance` is dense pure rule logic — the symmetric
  same-zone engagement invariant, `move → break-engagement` (D28), Forte
  strongest-wins, the three-state fog derivation. v1 already homes all of it in
  `packages/game/src/engine/`; re-homing it into `apps/web` would be a regression.

The **one-way dependency** the combat ADR committed (CD15: combat reads spatial; spatial
stands alone, runs in dungeon exploration with no combat session) maps cleanly onto
D33's existing dependency gradient: `spatial/` is a domain folder that imports `kernel/`
+ `mechanics/zone-enchantment.schema` (down the gradient) and **nothing** sideways into
`encounter/`/`combat/`/`visibility/`.

## SD2 — The seam is structural: an asymmetric depcheck import-direction rule · **Settled** (closes Q11)

CD15's one-way dependency was *documented intent* with no enforcement — `depcheck.mjs`
gated only v1-independence (D32) + catalog-port injection (D33), not import direction.
Q11 asked for a structural guard when the folder lands. Decided: add a **third rule** to
`packages/game-v2/depcheck.mjs`'s `scanSource`, mirroring the `mayImportCatalog` shape,
and an **asymmetric** one:

- **`spatial/** → {encounter, combat, visibility}` is forbidden** (hard gate, exit 1).
- **`encounter/** → spatial` stays allowed** — the composition tier (`reduceEncounter`)
  and the loader legitimately reach into spatial; *combat reads spatial* is the whole
  seam.

`depcheck.mjs` is the **hard** gate (the shared eslint config's `only-warn` plugin
downgrades `no-restricted-imports` to a warning, so the script must carry enforcement);
the `eslint.config.js` `DOMAIN_FOLDERS` list gains `"spatial"` and a `files:
["src/spatial/**"]` block mirroring the rule for editor-time signal. This makes the
`SpatialReads` port (CD15) + the raw occupancy-token projection (SD8) the **only**
compile-time coupling between the two domains — ports-and-adapters made structural,
mirroring CD1/CD3/CD14's build-time disjointness assertions.

## SD3 — The CD13↔Q11 tension resolves by moving *only* `Engagement` (+ the `ParticipantId` brand) down to `kernel/`, not by duplicating shapes · **Settled**

CD13 roots the instance-lifecycle components in `encounter/` ("a sibling
`InstanceRegistry` rooted in `encounter/`, **not** the kernel `ComponentRegistry`").
SD2's rule forbids `spatial → encounter`. But the spatial reducer must **write** values
of the `Engagement` shape onto its occupancy token — so something has to give, or the
rule is unsatisfiable on day one.

Audit of what is genuinely dual-homed (written by spatial **and** read by combat):

| Shape | Written by spatial? | Same value on both sides? | Verdict |
|-------|---------------------|---------------------------|---------|
| `Engagement` union | **Yes** — the occupancy token's `engagement` field (`MapToken.engagement`) | **Yes — literally one value** the loader passes through raw | **Move to neutral `kernel/vocab/`** |
| `ParticipantId` brand | **Yes** — token keys + `Engagement.targetCombatantIds` | Yes — `engagementSchema` references `participantIdSchema` | **Moves with `Engagement`** (kernel can't import `encounter/ids`) |
| `Position = { zoneId }` | **No** — the token stores a bare `zoneId: string`; the *component wrapper* is built combat-side (SD8) | No — spatial never names `Position` | **Stays in `encounter/instance.ts`** |
| `ZoneEnchantment` | Yes — `applyEnchantment` writes it | Yes | **Stays in `mechanics/zone-enchantment.schema`** (Bard owns it; `spatial → mechanics` is down-gradient, allowed) |

So the genuinely-shared distinction is **exactly one shape** — the `Engagement`
discriminated union — plus the id brand it transitively references. Resolution (the S1
keystone):

1. `Engagement` + `engagementSchema` → **`kernel/vocab/engagement.ts`** (joining
   `ENCHANTMENT_TYPES`, which lives there *for this exact reason* — "so a `skills →
   mechanics` cross-domain import is never needed"). This also mirrors **v1's own home**:
   v1's `map-instance.ts` imports `engagementSchema` from the neutral
   `foundation/combat/engagement.ts`, shared by the combatant **and** the Map-Instance.
2. `ParticipantId` / `participantIdSchema` / `asParticipantId` → **`kernel/`** (sibling
   of `kernel/identity.schema.ts`) — engine-wide roster-slot identity vocab, already
   shared by `encounter/` + `visibility/` and now `spatial/`.
3. Consumers import both **directly from `kernel/`** (the read-bag, `disjointness.ts`, the
   visibility `engagement` row, `session-event.ts`'s `combatEventSchema`) against the
   **same type identity**. _As-built note:_ the move was specced to shim through
   `encounter/ids.ts` / `instance.ts` re-exports to keep then-in-flight UNN-516/517
   churn-free; they **merged before S1**, so S1 deleted `encounter/ids.ts` and repointed
   every consumer at the kernel home — no vestigial pass-through forwarder. `instance.ts`
   keeps `Position`/`INSTANCE_KEYS` and *imports* `Engagement` for its grouping.
4. `INSTANCE_KEYS`, `EncounterInstanceComponents`, `disjointness.ts`, and `Position`
   **stay rooted in `encounter/`.** CD13's prohibition is honored exactly: a standalone
   *value schema* in `kernel/vocab` carries **no `ComponentRegistry` key** and forces
   **no durable load-seam entry** — that is the precise distinction CD13 drew ("not the
   kernel `ComponentRegistry`"), and it is the same shape `kernel/vocab/enchantment`
   already is. The *read-bag-merge registry* (the `InstanceRegistry`) stays the combat
   concern CD13/CD14 made it.

This is "decide a distinction once" (Code Style #9): the `Engagement` shape is decided
once at the lowest boundary both importers can reach **down** to, resolved into a single
type, and everything downstream (the token writer, the read-bag reader) is blind to
where it was decided. The rejected alternative — spatial re-declares its own token
`engagement` union and the loader projects — is the duplication the principle forbids
(a loader projection copies a *value*; it does not dedupe a *type*).

## SD4 — Single-zoneId is a permanent combat-facing contract · **Settled** (closes Q8)

Confirmed with the rulebook, not just asserted. §3.5 *Zones & Movement* is
theater-of-the-mind: *"Combat does not take place on a grid… characters within a Zone
are not pinned to a particular spot."* A creature **occupies one Zone** at a time (the
rulebook's own phrasing — "the Zone it occupies"); there is no grid, no spanning
creature, no multi-zone occupancy anywhere in the rules. So `Position = { zoneId }` and
the single-zoneId equality in `zoneEnchantmentEffects` are confirmed **permanent**. The
constraint rides the **engine-owned `activeEnchantment` helper**, not the `Position`
shape (CD15), so a hypothetical future coordinate model would update **one helper**, not
the component — but no such model is on the horizon, and the contract is honest today.

## SD5 — The occupancy token is the instance home; it is dual-keyed (slot in combat, character in exploration) · **Settled**

`MapInstanceState = { geometry, occupancy: Record<id, MapToken>, enchantment, reveal }`;
`MapToken = { zoneId, engagement }` (v1 verbatim). The occupancy map is keyed by the
**token key**, which is dual-lifecycle:

- **in combat** — the `ParticipantId` (the roster slot), establishing `participantId ===
  token key` at birth (R1.3, the co-mint CD16 names);
- **in exploration** — the `characterId` (the durable PC), because **the delve roster
  IS the set of occupancy tokens** keyed by character (SD11) — there is no separately
  stored roster.

The spatial reducer treats keys **opaquely** (plain string-map operations) except inside
the `Engagement` value it writes, whose `targetCombatantIds` are `ParticipantId`s (combat
only — exploration has no engagement). This is why the brand move (SD3) is load-bearing
rather than cosmetic: the combat session-factory (UNN-515) and the spatial
instance-factory must mint tokens keyed by the **same** brand for the R1.3 co-mint to
typecheck.

## SD6 — `reduceMapGeometry` stays a separate reducer from `reduceMapInstance` · **Settled**

v1 keeps the 9-event map-template editor (`reduceMapGeometry` over `{ zones, connections
}`) physically separate from the 16-event Map-Instance reducer, and v2 preserves the
split — not for symmetry but because the **My Maps template editor consumes
`reduceMapGeometry` standalone**, with a different signature (it is **not** curried; the
canvas mints ids and rides them on events). The Map-Instance re-homes geometry edits via
its `editGeometry` event → delegating to `reduceMapGeometry` over `state.geometry`, then
layering Instance-only reconciliation (block deleting an occupied zone; reconcile
reveal/enchantment with the new geometry). Carving the geometry reducer into its own PR
(S2) lets the map-editor UI re-home immediately, long before the instance reducer exists
(S4). Folding it into S4 would needlessly block that.

## SD7 — `move → break-engagement` (D28#1) lives in spatial; allegiance-gated candidates (D28#2) live at the composition tier · **Settled**

D28's two v2 improvements split by **what state they read**:

- **D28#1 — moving breaks engagement** *is* spatial: it is a pure consequence of
  leaving a zone (the symmetric same-zone invariant), and belongs in the `moveCombatant`
  slice of `reduceMapInstance`. v1's `move → break-engagement` already does this.
- **D28#2 — engagement candidates are Allegiance-gated to the opposing side** is **not**
  spatial: `Allegiance` is encounter *overlay* (D29), and **spatial stands alone with no
  allegiance** (SD1/CD15). The opposing-side candidate list is therefore a
  **composition-tier selector** that takes allegiance injected — homed at the seam (S5),
  reading the session's `Allegiance` overlay + spatial's `zoneOf`, never inside the
  spatial reducer. Putting it in the spatial reducer would force a spatial→combat read
  and break SD2.

## SD8 — The token→component projection is encounter-side; spatial exports raw selectors only · **Settled** (the subtlest correctness point)

The merged read-bag (CD14) carries `position` + `engagement` components. The projection
*occupancy-token → { position: { zoneId }, engagement }* must **not** live in spatial: a
spatial module that produced `EncounterInstanceComponents`/`Position` would import those
types from `encounter/` and break SD2. Resolution, extending CD15's adapter pattern:

- **Spatial exports pure selectors** over its own state: `zoneOf(state, id)`,
  `activeEnchantment(state)`, `engagementOf(state, id)` (and the raw `MapToken` read).
  These name **neither** `SpatialReads` **nor** any `encounter/` type.
- **The combat side binds the adapter.** The `reduceEncounter`/loader composition (S5)
  wraps spatial's selectors into an object `satisfies SpatialReads` and builds the
  instance read-bag (`position: { zoneId: token.zoneId }`, `engagement:
  token.engagement`) for `assembleReadBag`. Because `Engagement` is now the kernel type
  (SD3), the token's `engagement` value flows into the read-bag `engagement` field with
  **no import of `encounter/` from spatial and no duplication** — structural and clean.

If spatial instead imported `SpatialReads` to *implement* it, it would re-break the
one-way rule and depcheck would (correctly) fail. The port interface stays consumer-side
(`encounter/spatial-reads.ts`); the adapter is bound at the composition root.

## SD9 — `pruneCombat` clears the enchantment at combat-end even if the Map-Instance continues into exploration · **Settled** (closes Q10)

Q10 asked whether combat-end should clear the zone enchantment when the same Map-Instance
keeps running into exploration after the fight, or whether a delve enchantment should
persist. **Resolved by the rules, not preference:** the Enchantment page states *"All
Enchantments end when combat ends."* So `pruneCombat` clears it (v1 behavior, now
rules-anchored): combat-end frees survivor engagement, **clears the enchantment**, and
**keeps survivor zoneIds** (positions survive the overlay sweep but engagement + the
enchantment singleton are combat-scoped). This is exactly the asymmetry CD13 cited as the
reason the `instance` lifecycle must exist.

## SD10 — Spatial redaction composes *over* the combat snapshot envelope; it never edits it · **Settled**

The combat ADR's §2.6 projector is intentionally **not** RED-1-complete (it stops at the
non-spatial envelope and projects `position`/`engagement` as public read-units). The
spatial projector (S6) **wraps** `projectEncounterSnapshot`: it adds spatial fields and
applies the field-level + fog-gated transforms *after* the envelope produces the
combatant list — never reaching into the envelope. The transforms (PRESERVE v1):

- **field-level `zoneId → ""`** for a combatant in an unrevealed zone (RED-9c, a
  post-fold field transform the combat ADR explicitly deferred here);
- **drop unrevealed zones** from the zone list; project `MapZone → { id, name }` (never
  `dmNotes`/`position`);
- **withhold the enchantment** when its zone is unrevealed;
- **known-exit silhouettes** — a connection with exactly one revealed endpoint surfaces
  as an exit (far zone stripped), via the derived three-state `connectionFogState`.

`isFogActive(reveal)` (non-empty `revealedZoneIds`) is the structural signal that the
projector runs the fog-clamping arm at all — a standalone encounter (no reveal state)
shows the full map; a delve clamps.

## SD11 — The dungeon exploration loop derives its roster from occupancy; status is a column, not an event · **Settled**

`reduceDungeon` over `{ turnCounter, actedCharacterIds, reminderSettings }` handles two
events (`markActed`, `advanceTurn`) and stores **no roster** — the delve roster is
**derived** from the Map-Instance occupancy tokens keyed by `characterId` (a read-time
filter; departed characters' stale ids are pruned by the `activeActedCharacterIds`
selector). The lifecycle (`draft | active | done`) is a **row-column flip** in the app
layer, not a reduce event — mirroring encounter status. The turn loop is self-contained
(no catalog/`GameData` dependency); the day/exhaustion constants (`DUNGEON_DAY_TURNS`,
`EXHAUSTION_ONSET_TURN`, …) carry over verbatim.

## SD12 — Six build slices land as three engine PRs (+ a sequenced consumer tail) · **Settled**

The six slices (S1–S6) are the *internal* build order; they ship as **three landable
PRs** grouped by the new-vs-migration / dependency axis (decomposition + DAG in [`ADR.md
§4`](./ADR.md)):

- **PR1 = S1** — foundation + the one-way seam (design-heavy; the cross-track coordination
  point).
- **PR2 = S2 + S3 + S4** — the migration bucket: three pure standalone reducers,
  golden-mastered against v1 (large but low-risk; the one non-parity spot is D28#1).
- **PR3 = S5 + S6** — the composition join + the compose-over redaction (gated on the
  combat track: UNN-517 for the `reduceEncounter` arm, UNN-522 for the visibility wrap).

**Why S6 is in PR3, not PR2:** the chain `S4 → S5 → S6` makes a `{S4, S6}` migration
bucket and a standalone S5 PR **mutually blocking** — so the migration bucket is exactly
the three *standalone* reducers, and the integration tail {S5, S6} is its own PR. Landing
order `PR1 → PR2 → PR3` is a clean linear chain; **PR1 + PR2 run fully parallel to the
combat track**, only PR3 waits for the join. **S1's vocab move (SD3) is the single
cross-track coordination item** — non-breaking via re-export, but it must be called out on
UNN-516/517 so a rebase doesn't surprise them. Milestone _Phase E — Map-Instance Spatial
Subsystem (Tier 3)_.

---

### Open items (honest — confirmations the build slices will close)

1. **Exact home of the `ParticipantId` brand** (SD3) — `kernel/identity.schema.ts` vs a
   sibling `kernel/ids.ts`. A file-placement call for S1; the *fact* (it leaves
   `encounter/`) is settled.
2. **Curry asymmetry** (SD6) — v1 ships these with *different* signatures, and v2
   preserves it: `reduceMapGeometry` is **un-curried** (ids ride on the events, no
   `newId`/`GameData` dep), whereas `reduceMapInstance(newId)` is **curried on `newId`**
   (it mints ids on the instance-reconciliation path). Settled by the v1 sources; noted so
   a reviewer doesn't "fix" the asymmetry into false uniformity.
3. **Instance version-token sharing** (CD16 Q9, parent) — whether `reduceEncounter`'s
   `guardMany` reads the same `mapInstances.version` the spatial writer owns, or a
   read-only view of it. A persistence-shape call for C1; `guardMany` needs the token, it
   need not own it.
4. **Free-entry occupancy** — whether a DM-typed inline enemy is auto-placed into a zone
   at session mint or starts unplaced (`zoneOf → undefined`). v1 places at setup; an
   authoring-UX call for C2/C3, not an engine blocker (the reducer reads presence either
   way).
