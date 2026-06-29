# ADR: Engine v2 — The Map-Instance Spatial Subsystem (Tier 3)

**Status:** Accepted (design) · build not started
**Scope:** the **spatial** layer of `@workspace/game-v2` deferred by both prior ADRs to
"its own future ADR" — zone geometry + `reduceMapGeometry`, the Map-Instance occupancy
token (the instance home for `Position` + `Engagement`), the movement / engagement
**transition** events + the engagement-graph **write** primitives, apply / clear zone
enchantment (the write side of `activeEnchantment`), fog / reveal + connection locks, the
dungeon exploration loop (`reduceDungeon`), and field-level (`zoneId → ""`) + fog-gated
redaction composing over the combat snapshot envelope. It re-homes v1's spatial
subsystem onto v2 components with **zero v1 imports** (D32).
**Supersedes:** the design intent of v1 `reduceMapInstance` / `reduceMapGeometry` /
`reduceDungeon` + the dungeon/encounter player snapshots, re-homed off
`@workspace/game`.
**Honors as fixed (does not relitigate):** the combat→spatial **seam** committed by the
combat ADR — `Position`/`Engagement` as instance-lifecycle READ components written only
by the spatial reducer (CD13), the `SpatialReads` port (CD15), the `reduceEncounter`
composition contract (CD16), the `engagedWith` un-stub (CD17), and the §2.6 projector the
spatial projector composes **over** (CD12).
**Supporting artifacts:** [`decision-log.md`](./decision-log.md) (chronological
rationale, **SD1–SD12** for this layer), the [parent ADR](../ADR.md) (§5 Tier-3
deferral; D28/D29/D32), the [combat ADR](../combat/ADR.md) (§2.10 the seam, §5 the
deferral), the combat [`decision-log.md`](../combat/decision-log.md) (Q8/Q10/Q11 — the
spatial-side confirmations this ADR closes), and
[`requirements/04-views-redaction-dungeon.md`](../requirements/04-views-redaction-dungeon.md)
(RED/DRD redaction spec).

> This ADR is the **clean current-state synthesis**. Where it cites `SD<n>` the
> chronological reasoning lives in this layer's decision log; `CD<n>` cites the combat
> ADR's decisions; `D<n>` cites the parent ADR.

---

## 1. Context

This is the **last deferred layer** of engine v2. The kernel, `resolve`, mechanics,
items, skills, the combat resolvers, and the combat/encounter subsystem (Session
container, pure reducer, overlay components, turn loop, visibility projector) already
exist or are landing; the **spatial internals** were deliberately punted by both ADRs to
keep the core engine shippable (parent ADR §5; combat ADR §5).

The combat ADR did **not** leave the seam blind. It pulled a narrow **read** seam forward
(CD13–CD17) and built it into `encounter/`: `Position`/`Engagement` read shapes
(`instance.ts`), the `SpatialReads` port (`spatial-reads.ts`), the three-home merged
read-bag (`read-bag.ts`), the 3-way disjointness assert (`disjointness.ts`), and the
opaque-`instance` composition root (`reduce-encounter.ts`). This ADR designs the
**internals that seam reads** — the *write/author/derive* side — and re-homes v1's
spatial subsystem onto them.

**The shape of the dependency is already settled and one-way** (CD15): combat reads
spatial; **spatial stands alone.** The Map-Instance runs in **dungeon exploration with no
combat session at all** — a delving party moves through zones, reveals fog, and opens
locked doors with no initiative, no turn order, no overlay. Combat, when it starts, is an
*encounter layered onto* a Map-Instance. So the spatial layer must never depend on combat,
and this ADR makes that **structural** (SD2), not a matter of vigilance.

**What this layer owns** (the parent ADR §5 list, made concrete):

1. Zone **geometry** + the standalone `reduceMapGeometry` template editor.
2. The Map-Instance **occupancy token** — the authoritative home for `Position` +
   `Engagement`.
3. **Movement** + **engagement** transition events + the engagement-graph write
   primitives (the symmetric same-zone invariant).
4. **Apply / clear zone enchantment** — the write side of `activeEnchantment`.
5. **Fog / reveal** + connection locks.
6. The **dungeon exploration loop** (`reduceDungeon`).
7. **Field-level + fog-gated redaction** composing over the combat envelope.

**What stays out** (parity guards, unchanged): ranges + opportunity-attacks stay
DM-adjudicated (no `validTargets`, no auto reactions); the combat-SESSION reducer
reads/writes no spatial field (R24.5); the action budget stays the constant 1/1/1.

---

## 2. Decision

### 2.1 Residency + the structural one-way seam (SD1, SD2; closes Q11)

The spatial layer is a **new domain folder `packages/game-v2/src/spatial/`** — a sibling
of `encounter/`, `combat/`, `mechanics/`, governed by the same D33 dependency gradient.
Not a sibling package (contradicts D32's single-successor model), not an app-layer
reducer (violates "never put game logic in the UI layer" — the engagement / fog / Forte
rules are dense engine logic v1 already homes in `packages/game/src/engine/`).

The one-way dependency (CD15) is made **structural** by an **asymmetric** import-direction
rule, added as a third rule to `packages/game-v2/depcheck.mjs`'s `scanSource` (the hard
gate — the shared eslint config's `only-warn` downgrades `no-restricted-imports` to a
warning, so the script carries enforcement):

- **`spatial/** → {encounter, combat, visibility}` is forbidden.** Spatial stands alone;
  it may import `kernel/` + `mechanics/zone-enchantment.schema` (down the gradient) and
  nothing sideways.
- **`encounter/** → spatial` stays allowed.** The composition tier (`reduceEncounter`) +
  the loader legitimately reach into spatial — *combat reads spatial* is the seam.

`eslint.config.js` gains `"spatial"` in `DOMAIN_FOLDERS` + a `files: ["src/spatial/**"]`
block mirroring the rule (editor-time signal). The result: the `SpatialReads` port (2.6)
and the raw occupancy-token projection (2.9) are the **only** compile-time coupling
between the domains — textbook ports-and-adapters, enforced like CD1/CD3/CD14's
disjointness asserts.

### 2.2 The vocabulary move — `Engagement` + `ParticipantId` go to `kernel/`, resolving the CD13↔Q11 tension (SD3)

CD13 roots the instance-lifecycle components in `encounter/`; SD2's rule forbids `spatial
→ encounter`; the spatial reducer must **write** the `Engagement` shape onto its
occupancy token. The resolution is **minimal** — move exactly the one genuinely
dual-homed shape down to where both domains reach:

- **`Engagement` + `engagementSchema` → `kernel/vocab/engagement.ts`** (joining
  `ENCHANTMENT_TYPES`, homed there for this exact reason). It mirrors **v1's own home** —
  v1's `map-instance.ts` imports `engagementSchema` from the neutral
  `foundation/combat/engagement.ts`, shared by the combatant **and** the Map-Instance.
- **`ParticipantId` / `participantIdSchema` / `asParticipantId` → `kernel/`** (sibling of
  `kernel/identity.schema.ts`) — engine-wide roster-slot identity vocab, already shared by
  `encounter/` + `visibility/`, now `spatial/` too (`engagementSchema` references it, and
  kernel can't import `encounter/ids`).
- **Consumers import both from `kernel/` directly** (`kernel/participant-id.schema`,
  `kernel/vocab/engagement`). The move was originally specced to shim through
  `encounter/ids.ts` / `instance.ts` re-exports to keep then-in-flight UNN-516/517
  churn-free; those **merged before S1 landed**, so the shim's reason was moot and S1
  deletes `encounter/ids.ts` outright — one honest home per shape, no pass-through
  forwarding. `encounter/instance.ts` keeps `Position`/`INSTANCE_KEYS` and now *imports*
  `Engagement` from kernel for its grouping (no re-export). _(As-built amendment; the
  SD3 decision — move only these two shapes down — is unchanged.)_

**What stays put:** `Position`, `INSTANCE_KEYS`, `EncounterInstanceComponents`,
`disjointness.ts` stay rooted in `encounter/` — they are the *read-bag-merge registry*,
a combat concern (CD13/CD14). `ZoneEnchantment` stays in
`mechanics/zone-enchantment.schema` (Bard owns it; `spatial → mechanics` is allowed).
CD13's prohibition is honored exactly: a standalone *value schema* in `kernel/vocab`
carries **no `ComponentRegistry` key** and forces **no durable load-seam entry** — that
is the precise distinction CD13 drew, and it is the same shape `kernel/vocab/enchantment`
already is. Decide-a-distinction-once (Code Style #9): the `Engagement` shape is decided
once, at the lowest boundary both importers reach **down** to.

### 2.3 Zone geometry + `reduceMapGeometry` (SD6)

`MapGeometry = { zones: Record<zoneId, MapZone>, connections: Record<connectionId,
MapConnection> }`. A `MapZone` carries `{ id, name, description, dmNotes, position{x,y} }`
(player-facing `description` shown on reveal; private `dmNotes`; canvas-layout
`position`). A `MapConnection` is **undirected**: `{ id, fromZoneId, toZoneId, hidden,
locked }` (authored fog/access flags the runtime reveal state overlays, 2.7).

`reduceMapGeometry(geometry, event) → geometry` is the **standalone map-template editor**
— **9 events** (`addZone`, `duplicateZone`, `renameZone`, `setZoneText`, `moveZone`,
`deleteZone`, `addConnection`, `setConnectionFlag`, `deleteConnection`), Immer `produce`
with same-ref no-ops. Invariants (PRESERVE v1): zones never self-loop; connections never
duplicate (checked both directions); deleting a zone **cascades** (prunes every touching
connection); empty renames no-op. It is **not curried** (no deps; the canvas mints ids
and rides them on events). It stays a **separate reducer** from the Map-Instance (SD6)
because the My Maps editor consumes it standalone — which lets the map-editor UI re-home
right after this slice (S2), long before the instance reducer exists.

### 2.4 The occupancy token + `MapInstanceState` (SD5)

```ts
type MapInstanceState = {
  geometry:    MapGeometry                    // §2.3 — the authored zone graph
  occupancy:   Record<string, MapToken>       // spatial presence, dual-keyed (below)
  enchantment: ZoneEnchantment | null         // the singleton — §2.6
  reveal:      RevealState                     // the runtime fog overlay — §2.7
}
type MapToken = { zoneId: string; engagement: Engagement }   // v1 verbatim
```

The occupancy map is keyed by the **token key**, which is **dual-lifecycle** (SD5):
`participantId` (the roster slot) **in combat** — establishing `participantId === token
key` at birth (R1.3, the CD16 co-mint) — and `characterId` (the durable PC) **in
exploration**, because the delve roster *is* the set of occupancy tokens keyed by
character (2.8), with no separately stored roster. The spatial reducer treats keys
**opaquely** (plain string-map ops); only the `Engagement` value it writes carries
`ParticipantId` targets (combat only). **`Position` never appears in spatial** — the token
stores a bare `zoneId`; the combat-side loader wraps it into the `Position` component
(2.9), so spatial owns the *fact* of placement without naming the *component*.

### 2.5 Movement + engagement transitions + the engagement-graph write primitives (SD7)

`reduceMapInstance(newId)(state, event) → state` is the **16-event** spatial reducer
(curried on `newId`; Immer `produce`, **6 grouped slices** — zone-graph, move, engagement,
enchantment, reveal, geometry-edit). The movement + engagement transitions and their write
primitives:

- **`moveCombatant(tokenKey, toZoneId)`** — writes the token's `zoneId`, and (D28#1)
  **breaks engagement on leaving the zone** (the symmetric same-zone invariant: any
  engagement whose partner is no longer co-located is severed on both sides), and
  **auto-reveals** the entered zone (`move → reveal`, 2.7). v1 couples move and lock
  exactly so.
- **`setEngagement` / `clearEngagement`** — establish / drop a melee lock through the
  **engagement-graph write primitives** `setEngaged(token, targets)` / `unlink(token,
  otherId)` over the read `engagedWith(token)`, maintaining the **symmetric** invariant
  (A engaged↔B engaged) by mirrored writes — the symmetry lives here, in spatial, never in
  combat (CD13).
- The **occupancy helpers** — the write-obligations the combat composition *names but
  never performs* (CD16/R23): `addOccupant(state, key, token)` (place a combatant),
  `removeOccupant(state, key)` (remove + **sever its engagement symmetrically** from
  every survivor, R23.2), and `pruneCombat(state, removeKeys)` (combat-end, 2.6/SD9).
  These are **pure helpers**, not `MapInstanceEvent`s — the composition calls them inside
  one transaction alongside the session reduce.

**D28#2 (engagement candidates Allegiance-gated to the opposing side) is NOT here** —
`Allegiance` is encounter overlay and spatial has none, so the opposing-side candidate
list is a **composition-tier selector** (2.8/S5) with allegiance injected.

### 2.6 Zone enchantment write side + the `SpatialReads` adapter (SD8, SD9)

The enchantment slice writes the singleton `ZoneEnchantment = { zoneId, type, forte }`
(reusing `mechanics/zone-enchantment.schema` — `MAX_FORTE`, `forteMarking`):

- **`applyEnchantment(zoneId, type)`** — re-apply the **same** zone+type → raise Forte
  (capped at `MAX_FORTE`); a **different** zone or type → replace at Forte 1. The
  one-enchanted-zone rule stays **structural** (a nullable singleton; a second Enchant
  overwrites). Affinity is **strongest-wins-incl-base** (the parent decision; the
  enchantment effect competes with base, strongest type wins).
- **`clearEnchantment()`** — remove. Called by `pruneCombat` at combat-end, because *"All
  Enchantments end when combat ends"* (rulebook) — **even if the same Map-Instance
  continues into exploration** afterward (SD9, closing Q10).

**The combat-facing read** is the `SpatialReads` port (CD15) — `zoneOf(participantId)` +
`activeEnchantment()`. Spatial does **not** implement the port directly (that would import
`SpatialReads` from `encounter/` and break SD2). Instead (SD8): **spatial exports pure
selectors** over its own state (`zoneOf(state, id)`, `activeEnchantment(state)`,
`engagementOf(state, id)`); **the combat-side composition binds the adapter** — wrapping
those selectors into an object `satisfies SpatialReads`. The port interface stays
consumer-side; the adapter is bound at the composition root. This is the subtlest
correctness point in the layer.

### 2.7 Fog / reveal + connection locks

`RevealState = { revealedZoneIds: string[], revealedConnectionIds: string[],
unlockedConnectionIds: string[] }` — a **runtime overlay** on the immutable authored
`hidden`/`locked` flags (never mutates geometry). The reveal slice (6 events):
`revealZone` / `hideZone` (DM manual + the auto `move → reveal`, idempotent),
`revealConnection` / `hideConnection` (surface / re-conceal a hidden connection),
`unlockConnection` / `lockConnection` (open / re-bar a locked door). Derived, never
stored: the three-state **`connectionFogState(connection, reveal)` ∈ {revealed,
known-exit, stripped}** (both endpoints revealed → full edge; exactly one → silhouette,
far zone unnamed; neither / hidden-unrevealed → absent), `isConnectionLocked` (`locked &&
!unlocked`), `isZoneRevealed`, and `isFogActive(reveal)` (non-empty `revealedZoneIds` —
the structural signal that a delve, not a standalone encounter, is running). This is the
`editGeometry` slice's reconciliation partner: a geometry edit that removes a zone/
connection must reconcile the reveal sets.

### 2.8 The dungeon exploration loop (SD11)

`reduceDungeon(state, event) → state` over `DungeonState = { turnCounter,
actedCharacterIds, reminderSettings }`, **2 events** (`markActed`, `advanceTurn`), Immer
`produce`. It stores **no roster** — the **delve roster is derived** from the Map-Instance
occupancy tokens keyed by `characterId` (a read-time filter; the `activeActedCharacterIds`
selector prunes departed ids). Lifecycle (`draft | active | done`) is a **row-column
flip** in the app layer, not a reduce event (mirrors encounter status). Self-contained (no
catalog/`GameData` dep); the day/exhaustion constants (`DUNGEON_DAY_TURNS = 48`,
`EXHAUSTION_ONSET_TURN`, …) carry over verbatim.

This is the layer that proves spatial **stands alone**: `reduceDungeon` +
`reduceMapInstance` + `reduceMapGeometry` are a complete exploration engine with no
`Session`, no `CombatEvent`, no overlay.

### 2.9 Composition — wiring the spatial arm into `reduceEncounter` (the cross-track join, S5)

This is where the two tracks meet. The combat ADR shipped `reduceEncounter`
(`reduce-encounter.ts`) as a **generic-over-`Instance`** root that routes every
`CombatEvent` → the session reducer and carries `instance` **untouched** (opaque). This
ADR fills it in:

- **Substitute `MapInstanceState`** for the opaque `Instance` type parameter.
- **Route `MapInstanceEvent` → `reduceMapInstance`** (the spatial arm), keeping the
  same-ref no-op contract end-to-end (R24.1).
- **Own the cross-cutting `guardMany` transaction** over the two version tokens
  (`encounter.version` + `mapInstances.version`): the **birth co-mint** (one `setup[]` →
  session + instance, `participantId === token key`), `addParticipant ↔ addOccupant`,
  `removeParticipant ↔ removeOccupant`-sever, and the **combat-end** composed sweep +
  `pruneCombat` + status-flip (§2.8 combat ADR).
- **Bind the `SpatialReads` adapter** (2.6/SD8) from spatial's selectors + the
  `MapInstanceState`, and build the instance read-bag (`position: { zoneId }`,
  `engagement`) for `assembleReadBag`.
- **Home the D28#2 allegiance-gated candidate selector** here (allegiance injected from
  the session overlay + `zoneOf` from spatial).

**`reduceEncounter` must stay generic over `Instance` until this PR** — the opacity is
load-bearing; concretizing it early turns S5 from a substitution into a breaking change.

### 2.10 Spatial redaction — composing over the §2.6 envelope (SD10)

The spatial projector **wraps** the combat ADR's `projectEncounterSnapshot`, adding
spatial fields and applying field-level + fog-gated transforms **after** the envelope
produces the combatant list — it **never edits the envelope** (CD12). When
`isFogActive(reveal)` the fog-clamping arm runs (PRESERVE v1, the RED-6/7/8/9 + DRD
family):

- **field-level `zoneId → ""`** for a combatant in an unrevealed zone (RED-9c — the
  post-fold field transform the combat ADR explicitly deferred to this layer);
- **drop unrevealed zones**; project `MapZone → { id, name }` only (never
  `dmNotes`/`position`);
- **withhold the enchantment** when its zone is unrevealed;
- **known-exit silhouettes** from `connectionFogState` (one revealed endpoint → exit, far
  zone stripped).

A standalone encounter (no reveal state) shows the full map; a delve clamps. The dungeon
watch snapshot (`DungeonSnapshot`) is the exploration-only sibling, redacted the same way
(revealed zones only, party tokens with public sheet vitals, enemy tokens only during
combat). The redaction stays **structural** (RED-4): a stripped field is absent on the
wire, never null.

### 2.11 Folder layout

```
packages/game-v2/src/
├── kernel/
│   ├── vocab/engagement.ts        + Engagement / engagementSchema           (SD3, moved)
│   └── participant-id.schema.ts   + ParticipantId / participantIdSchema     (SD3, moved)
├── encounter/
│   ├── instance.ts                Position/INSTANCE_KEYS stay; imports Engagement (SD3)
│   │                              (ids.ts deleted — ParticipantId now in kernel/)
│   ├── spatial-reads.ts            the one-way port (unchanged, consumer-side)  (CD15)
│   └── reduce-encounter.ts         S5 fills the spatial arm + cross-writes    (§2.9)
├── spatial/                        ← NEW domain folder                        (SD1)
│   ├── geometry.schema.ts          MapGeometry / MapZone / MapConnection
│   ├── map-instance.schema.ts      MapInstanceState / MapToken / RevealState
│   ├── dungeon.schema.ts           DungeonState + constants
│   ├── *-event.ts                  MapGeometryEvent (9) · MapInstanceEvent (16) · DungeonEvent (2)
│   ├── reduce-map-geometry.ts      §2.3 (standalone, un-curried — ids ride events)
│   ├── reduce-map-instance.ts      §2.5–2.7 (curried on newId, 6 slices)
│   ├── reduce-dungeon.ts           §2.8
│   ├── engagement-graph.ts         engagedWith · setEngaged · unlink         (symmetric)
│   ├── occupancy.ts                addOccupant · removeOccupant · pruneCombat (the R23 obligations)
│   ├── reveal.ts                   connectionFogState · isFogActive · …       (derived)
│   ├── selectors.ts                zoneOf · activeEnchantment · engagementOf  (the adapter source, SD8)
│   └── index.ts                    barrel — the `./spatial` export
└── depcheck.mjs / eslint.config.js  + the asymmetric spatial rule            (SD2)
```

### 2.12 Over-constraint guard (SD4; closes Q8)

Single-zoneId is **confirmed permanent** — the rulebook's zone model is
theater-of-the-mind, one Zone per creature, no grid, no multi-zone occupancy. `Position =
{ zoneId }` pins no coordinate model; the single-zoneId constraint rides the engine-owned
`activeEnchantment` helper (CD15), so a hypothetical future coordinate model updates one
helper, not the component. `SpatialReads` names only two reads; adjacency / reveal reads
are separate seams the consumers (not combat) use. The `instance` field stayed opaque
through the entire combat build — proof the seam did not box this ADR in.

---

## 3. Consequences

**Gains**

- The v1 spatial subsystem re-homes onto v2 components with **zero v1 imports** (D32),
  structurally enforced (SD2) — the one-way combat→spatial dependency is now a compile
  error to violate, not a documented hope.
- **Spatial genuinely stands alone**: `reduceDungeon` + `reduceMapInstance` +
  `reduceMapGeometry` are a complete exploration engine with no `Session` — exactly the
  delve-without-combat case CD15 promised.
- "Decide a distinction once" on `Engagement`: one schema, in `kernel/vocab`, written by
  the spatial token and read by the combat bag — no duplication, no sideways import.
  Mirrors v1's own neutral `foundation/combat/engagement.ts` home.
- The reducers stay **pure** and Immer-no-op-faithful; the occupancy helpers are the pure
  write-obligations the combat composition only *named* — now real.
- The non-spatial combat layer composes cleanly underneath: the snapshot envelope is
  **wrapped, not edited** (SD10); `instance` was opaque the whole time; no combat-shape
  migration is forced.

**Costs**

- **The vocab move (SD3) was the planned cross-track coordination item.** It touches files
  UNN-516/517 also edit — but those merged before S1 began, so the move resolved into a
  clean repoint (consumers import `ParticipantId`/`Engagement` from `kernel/`; `encounter/ids.ts`
  deleted) with no shim and no rebase coordination needed. Had they still been in flight, the
  re-export shim was the fallback.
- **Two occupancy keyings** (slot in combat, character in exploration, SD5) — one
  `Record<string, MapToken>` whose key *meaning* is lifecycle-dependent. Documented, and
  the brand move makes the combat half typecheck against the shared `ParticipantId`, but a
  reviewer must understand the dual-keying is intentional.
- **The dungeon roster is derived, not stored** (SD11) — a read-time filter over
  occupancy. Cheaper and single-source, but a selector (`activeActedCharacterIds`) must
  prune stale ids; a stored roster would not need that.
- **The adapter indirection (SD8)** — spatial exports raw selectors and the composition
  binds `satisfies SpatialReads`, rather than spatial implementing the port. One extra
  hop, but it is the hop that keeps the seam one-way; collapsing it re-breaks SD2.
- The `MapInstanceEvent` union is large (16 kinds / 5 slices) — but it is *the* single
  decision point for spatial behavior (Meyer's Single Choice Principle), each arm a
  genuinely different verb, and stays a reducer `switch`, **not** a registry.

---

## 4. Build & decomposition

**Behavior is the acceptance spec.** The v1 spatial reducers + snapshots are the parity
target; each behavior is PRESERVE (reproduce exactly) or SUPERSEDE (a decision changes it,
citing SD/CD/D). Build slice-by-slice red→green; the v1 reducers are the golden-master
(translate to v2 component shapes, **no `@workspace/game` import**, D32).

**Milestone: _Phase E — Map-Instance Spatial Subsystem (Tier 3)_** (the project's
"Phase X" convention), shipped as **three landable engine PRs** + a consumer tail. The
six build slices (S1–S6) are the *internal* build order; they land in three PRs grouped
by the new-vs-migration / dependency axis.

### Phase A — the spatial engine: three landable PRs

| PR | Slices | Scope | Gated on |
|----|--------|-------|----------|
| **PR1 — Spatial foundation + the one-way seam** | S1 | Move `Engagement`+`ParticipantId` → kernel (re-export from `encounter/`); scaffold `spatial/` + the `./spatial` export; **add the asymmetric depcheck rule** (+ eslint mirror); port the state schemas (`MapInstanceState`/`MapToken`/`RevealState`, `MapGeometry`/`MapZone`/`MapConnection`, `DungeonState`) + the three event unions as **single-source `z.infer`** (the Zod wire schema is the one source; no hand-written union + lockstep guard — `session-event.ts`'s `CombatEvent` was migrated to match). **Design-heavy + the cross-track coordination point** (the vocab move touches UNN-516/517 — which merged before S1, so it became a clean repoint into `kernel/` rather than a re-export shim). | — |
| **PR2 — Spatial reducers (the migration bucket)** | S2 + S3 + S4 | The three pure, standalone reducers + helpers, golden-mastered against v1: `reduceMapGeometry` (9 events, un-curried); the engagement-graph (`engagedWith`/`setEngaged`/`unlink`, symmetric) + occupancy helpers (`addOccupant`/`removeOccupant`-sever/`pruneCombat`, the R23 obligations); `reduceMapInstance(newId)` (16 events / 6 slices: zone-graph, move, engagement, enchantment, reveal/fog, editGeometry). **Large but low-risk** — pure parity, **except** D28#1 (`move`-breaks-engagement), the one deliberate SUPERSEDE whose golden-master *intentionally* diverges from v1. | PR1 |
| **PR3 — Composition + redaction tail** | S5 + S6 | The integration with the combat track: the `reduceEncounter` spatial arm + the cross-cutting `guardMany` seam (co-mint, add/removeOccupant, combat-end sweep+prune+flip); the combat-side `SpatialReads` adapter + instance read-bag projection; `reduceDungeon` (2 events) + delve-roster-from-occupancy; the D28#2 allegiance-gated candidate selector; the fog-clamping projector that **composes over** `projectEncounterSnapshot` (drop unrevealed zones, `zoneId→""`, withhold enchantment, `MapZone→{id,name}`, known-exit silhouettes) + `DungeonSnapshot`. | PR2, **UNN-517 + UNN-522** |

**Why S6 rides with S5, not the migration bucket:** the dependency chain is `S4 → S5 →
S6` (the redaction composes over the *wired* composition + the combat visibility track).
Bundling S6 with S4 in PR2 while S5 sits in PR3 would make PR2 and PR3 **mutually
blocking** — S4 must precede S5, but S6 must follow it. So the migration bucket is exactly
the three *standalone* reducers {S2, S3, S4}; the integration tail {S5, S6} is its own PR.

**Internal build order (DAG):** `S1→S2→S4`, `S1→S3→S4`, `S4→S5→S6` (S2 ∥ S3 after S1) —
landing as `PR1 → PR2 → PR3`, a clean linear chain. **PR1 + PR2 run fully parallel to the
combat track** (no combat dependency); only PR3 waits for the UNN-517/522 join.

**Split/merge calls:** keep `reduceMapGeometry` (S2) **separate** from `reduceMapInstance`
(S4) — the template editor consumes it standalone (SD6). Merge `reduceDungeon` into the
**PR3** composition (2 events — too small to stand alone). Do **not** split S4's reveal/fog
×6 events out (trivial set ops cohesive with the reducer).

### Phase B — consumer re-homing (`apps/web`, sequenced after the engine PR each needs)

The v1 consumers already exist; they re-point onto the v2 engine. Partially parallel.

- **C1 — Persistence** — `maps` / `map_instances` / `dungeon` tables + version-guarded
  writes; the untrusted-event boundary (`parse → isMapInstanceEvent → route to
  reduceMapInstance vs reduceSession`); cross-row `guardMany`. _(after S4/S5)_
- **C2 — Write actions** — server actions for move / engage / enchant / reveal /
  geometry-edit, routed through the S5 composition. _(after C1)_
- **C3 — UI** — the React Flow canvas (map editor needs only **S2**; dungeon run console
  needs **S5**), fog rendering (needs **S6**), the dungeon turn loop + player watch. The
  map-editor surface can land right after S2; the dungeon console waits on S5/S6.

### Cross-track sequencing

The combat (UNN-514…522) and spatial tracks meet at **exactly one engine point** (**S5**,
which extends UNN-517's `reduceEncounter` root) and **one consumer point** (**C1**). The
whole combat track can finish with `instance` opaque and `SpatialReads` **stubbed**
(`zoneOf → undefined`, `activeEnchantment → null`, so `engagedWith` is `[]` structurally),
so the tracks are **genuinely parallel up to S5**. S1's vocab move is the single
cross-track coordination item — non-breaking via re-export, flagged on UNN-516/517.

### PRESERVE / SUPERSEDE map (the v1 spatial behavior being re-homed)

| Behavior | Tag | Cite |
|----------|-----|------|
| `reduceMapGeometry` 9 events; undirected, no self-loop, dup-checked both ways, delete-cascade, empty-rename no-op, un-curried | PRESERVE | SD6 |
| `MapInstanceState`/`MapToken` shape (`{geometry, occupancy, enchantment, reveal}`, token `{zoneId, engagement}`) | PRESERVE | SD5 |
| occupancy keyed by combatant-slot **and** character | PRESERVE | SD5 |
| `moveCombatant` writes zoneId + auto-reveals entered zone | PRESERVE | §2.5 |
| v1 left the melee lock across moves → **v2 couples them: moving breaks engagement** | SUPERSEDE | D28#1 / SD7 |
| engagement candidates = every in-zone combatant → **opposing-side only (Allegiance-gated)** | SUPERSEDE | D28#2 / SD7 |
| engagement symmetric + same-zone (mirrored writes; `setEngaged`/`unlink`) | PRESERVE | CD13 / §2.5 |
| `addOccupant` / `removeOccupant`-sever / `pruneCombat` as pure helpers the composition calls | PRESERVE | CD16 / R23 |
| `pruneCombat` frees engagement, **clears enchantment**, keeps survivor zoneIds | PRESERVE | SD9 / Q10 |
| `applyEnchantment` singleton, Forte raise-on-resame / replace-on-different (cap `MAX_FORTE`); affinity strongest-wins | PRESERVE | §2.6 |
| `RevealState` overlay; reveal/hide zone+connection, unlock/lock; `move → reveal` | PRESERVE | §2.7 |
| `connectionFogState` three-state (revealed / known-exit / stripped) derived | PRESERVE | §2.7 |
| `reduceDungeon` (`markActed`/`advanceTurn`); roster **derived** from occupancy; status a column | PRESERVE | SD11 |
| player snapshot fog-clamp: drop unrevealed zones, `zoneId→""`, withhold enchantment, `MapZone→{id,name}` | PRESERVE (re-homed as a compose-over of §2.6) | SD10 / RED-6..9 |
| spatial state lived on the Session / combatant → **re-homed onto the Map-Instance occupancy token** (the M0 cutover, UNN-459) | SUPERSEDE | CD13 / D28 |
| v1 `@workspace/game` spatial imports → **none** (re-homed into `game-v2/spatial`) | SUPERSEDE | D32 / SD1 |

---

## 5. Deferred scope & open items

**Deferred (intentionally unaddressed):**

- **Coordinate / multi-zone occupancy** — single-zoneId is permanent (SD4); a coordinate
  model, were it ever wanted, updates the `activeEnchantment` helper, not `Position`.
- **Ranges + opportunity-attacks stay DM-adjudicated** — no `validTargets`, no auto
  reactions, no `Intercept`/`Approach` auto-resolution; the rulebook's movement actions
  stay prose the DM applies. The engine models exactly the two combat→spatial reads CD15
  fenced.
- **Random-encounter / reminder automation** — `reduceDungeon` carries the
  `reminderSettings` shape; the actual encounter-roll cadence is a display reminder, not
  engine resolution.

**Resolved here (were open in the combat log):** Q8 (single-zoneId — SD4), Q10
(combat-end enchantment-clear — SD9, by the rules), Q11 (the structural import rule —
SD2).

**Open items (build-slice confirmations, not blockers):** the exact file home of the
`ParticipantId` brand in `kernel/` (SD3); whether `guardMany` shares or read-only-views
the `mapInstances.version` (CD16 Q9 — a C1 persistence-shape call); whether a free-entered
inline enemy is auto-placed or starts unplaced (an authoring-UX call for C2/C3). None
block the engine; the reducers read placement presence either way.
