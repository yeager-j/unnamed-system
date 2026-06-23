# Encounter / Combat Write Architecture (current state)

A precise map of how combat state is reduced, persisted, versioned, read, and
invalidated today — to inform the v2 decision on whether combatant **working
vitals** (HP/SP during a fight) stay on the encounter session or move onto
durable entity rows.

All citations are `path:line` against the repo at the time of writing
(`feature/engine-v2`). Read-only investigation; nothing was changed.

---

## 0. The one correction up front

The prompt (and a stale doc comment) describe the reducer as a **decider**
returning `{ session', edits[] }`. **That is not what the code does.** The actual
reducer signature is pure state→state:

```
reduceCombatSession(lookups, newId) => (session, event) => CombatSession
```

`packages/game/src/engine/encounter/reduce-session.ts:38-83`. There is **no
`edits[]` return value anywhere in the reducer or its slices.** Every slice
returns a `CombatSession` and nothing else.

The `{ session', edits[] }` framing survives only as prose in two doc comments:
`packages/game/src/foundation/encounter/session.ts:152-156` and
`reduce-session.ts:19-22`. The `session.ts` comment is explicit that the idea was
**abandoned**: *"Combat-state transitions mutate the combatant overlay in place
(ADR Decision 2), so `edits[]` is now reserved for the rare PC vitals nudge … the
impure shell applies"* — but no such mechanism exists in code today. There is no
type `CombatEdit`, no field on the return, no shell that consumes edits.

**What replaced `edits[]`:** PC vitals are written through an *entirely separate*
Server Action + write wrapper (`adjust-pools`, §2), never through the combat
reducer or `applyCombatEvent`. So the "PC `edits[]` case" the prompt asks about
is, in the live code, "PC vitals are simply not a combat event at all."

This correction is load-bearing for the whole analysis, so it leads.

---

## 1. The combat-session reducer

**Entry:** `reduceCombatSession` — grouped exhaustive `switch` over `event.kind`,
no `default`, routing to per-domain slices in `reduce/`
(`reduce-session.ts:42-82`). Curried deps-first: outer call takes
`lookups: Pick<GameData, "getEnemy">` + a `newId` minter, bound once at the
composition root (`createGameEngine` → `apps/web/lib/game-engine.ts`).

Every transition **mutates the session** (returns a new `CombatSession`, via
Immer `produce` so a no-op returns the same reference). **No transition produces
`edits[]` or targets any row other than the session blob.** The complete case map:

| Event kind(s) | Slice (`reduce/…`) | What it touches (all in-session) |
|---|---|---|
| `endTurn` | `turn.ts:20` | marks actor `hasActedThisRound`, ticks `conditionDurations`, auto-expires axes to `neutral` |
| `startCombat` | `turn-start.ts:24` | sets `advantage`/`firstSide`, resets `hasActedThisRound`, clears `currentActorId` |
| `draftCombatant` | `draft.ts` | sets `currentActorId` |
| `advanceRound`, `addCombatant`, `removeCombatant`, `setSide` | `round.ts:30` | round counter, push/splice combatant, side flip |
| `adjustBattleConditionAxis`, `setBattleConditionFlag` | `conditions.ts` | combatant `battleConditions` overlay |
| `setAilment`, `clearAilment` | `ailments.ts` | combatant `ailments` |
| `adjustCounter`, `clearCounter` | `counters.ts` | combatant `counters` |
| `setActionEconomy` | `action-economy.ts` | combatant `move/standard/reactionAvailable` |
| `adjustEnemyVitals` | `enemy-vitals.ts:24` | **enemy** working HP/SP, in-session (§3) |
| `setCurrentActor`, `setActed`, `setRound` | `override.ts` | DM manual overrides |

**`edits[]` populated by:** nothing. The set is empty. Duration auto-expiry — the
one transition the old design earmarked for an edit — is explicitly done *in
place* now (`turn.ts:41-44`, doc at `turn.ts:14-17`: *"the reducer mutates combat
state in place rather than emitting an edit (ADR Decision 2; UNN-331)"*).

Note: spatial events (move/zone/engagement/enchantment) are a **separate** event
union `MapInstanceEvent` reduced by `reduceMapInstance` against the Map Instance
row — not part of `reduceCombatSession` at all (`session.ts:158-162`).

---

## 2. PC vitals path

**Where PC HP/SP/exhaustion live:** on the **character row**, not the session.
The `pc` combatant ref carries only `{ kind: "pc", characterId }`
(`session.ts:89`); it is a pointer. The session holds the *encounter overlay*
(ailments, battle conditions, counters, turn flags) for the PC, but never its
vitals (`session.ts:14-22`, `116-124`).

**How a PC damage/heal persists** — a path completely disjoint from the combat
reducer:

1. UI control (header owner actions / watch own-sheet column) calls Server Action
   `damageAction` / `healAction` / `spendSP` / `recoverSP` / `usePrisma`
   (`apps/web/lib/actions/adjust-pools.ts:46`).
   Auth: `requireOwnerOrCampaignDM` — the character's owner **or** the campaign DM
   (`adjust-pools.ts:52`, doc `:35-44`).
2. Action → write wrapper `applyDamageForCharacter` etc.
   (`apps/web/lib/db/writes/adjust-pools.ts:66`): hydrate the character
   (`loadHydratedCharacterById`), run the **character-engine** pure transition
   (`applyDamage`/`applyHeal`/… from `@workspace/game/engine`), then write the one
   changed pool column.
3. Persist via `bumpCharacterVersionGuarded(db, characterId, "vitals",
   expectedVersion, { currentHP })` (`writes/adjust-pools.ts:77-83`). This bumps
   the character's **`vitalsVersion`** column and fires `publishCharacterPing`
   (`writes/version-guard.ts:84-105`).

So a PC vitals change: **touches the `character` row, bumps `vitalsVersion`,
pings the `character:{shortId}` channel.** The encounter row, its `version`, its
session blob, and its channel are **not touched.** There is no `edits[]`, no
cross-row transaction, no involvement of `applyCombatEvent`.

`applyCombatEvent`'s own doc confirms this by design
(`apps/web/lib/actions/encounter/events.ts:72-75`): *"The reducer never writes a
character row; PC vitals move through their own pools actions (UNN-309 /
UNN-320)."*

---

## 3. Enemy vitals path

**Where enemy working HP lives:** inline on the session combatant ref — two
shapes (`session.ts:88-98`):

- **`enemy`** (free-entered): full `EnemyStatBlock` inline, carrying
  `currentHP/maxHP/currentSP/maxSP` (`session.ts:35-49`, ref arm `:90`).
- **`catalog-enemy`**: a thin `{ enemyKey }` pointer to the hardcoded definition
  for immutable identity, plus **only** `currentHP?/maxHP?` inline working HP
  (`session.ts:91-96`). Both `undefined` until first touched, defaulting to the
  definition's `maxHP`. **No SP** — the definition declares none.

**How `adjustEnemyVitals` persists** — `reduceEnemyVitalsEvent`
(`reduce/enemy-vitals.ts:24-71`): finds the combatant, floors the value at 0, and
writes the field **in-session**:
- `enemy` arm → mutates `ref.statBlock.currentHP/currentSP/maxHP/maxSP`
  (`:39-56`), with max-lowering dragging current down (`:50,54`).
- `catalog-enemy` arm → mutates `ref.currentHP`/`ref.maxHP` on the ref
  (`:57-67`), resolving the definition's max as the default for the clamp.
- **PC ref → no-op** (`:35` returns; doc `:20-22`): vitals aren't here.

The reduced session then flows through `applyCombatEvent`'s default branch:
`reduceCombatSession` → `saveEncounterSession(encounterId, next,
expectedVersion)` (`events.ts:119-120`). **Confirmed: stays entirely within the
encounter `session` jsonb. One row, one version, no cross-row write.**

---

## 4. Persistence + version / concurrency

**Session write:** `saveEncounterSession`
(`apps/web/lib/db/writes/encounter.ts:82-91`) → `bumpEncounterVersionGuarded`
(`:117-141`): one `UPDATE encounter SET session = …, version = version + 1 WHERE
id = … AND version = expectedVersion`, returning the new version; zero rows →
disambiguate `stale` vs `not-found` (`:134-138`).

**Encounter version columns:** the encounter row has **exactly one** `version`
integer (`schema/encounter.ts:55`). Doc `:13-17`: *"The DM … is the sole writer,
so a **single** `version` … token suffices."* (A combat **move** bumps a
*separate* row — `map_instances.version` — via `saveMapInstanceState`; that's the
spatial layer, not the session.)

**Character version columns:** **four** per-class tokens —
`identityVersion`, `vitalsVersion`, `inventoryVersion`, `progressionVersion`
(`schema/character.ts:155-158`), guarded by the per-class
`bumpCharacterVersionGuarded` primitive (`writes/version-guard.ts:84`). PC vitals
use the `vitals` class.

### Rows / versions per typical write

| Event | Rows written | Version columns bumped | Realtime pings | Reducer + transaction shape |
|---|---|---|---|---|
| **Enemy takes damage** (`adjustEnemyVitals`) | **1** (`encounter`) | **1** (`encounter.version`) | 1 (`publishEncounterPing`, `events.ts:123`) | single pure `reduceCombatSession` + single `saveEncounterSession`, no tx |
| **PC takes damage** (`damageAction`) | **1** (`character`) | **1** (`character.vitalsVersion`) | 1 (`publishCharacterPing`) | character engine `applyDamage` + `bumpCharacterVersionGuarded`, no tx, **no encounter touch** |
| Ailment/condition/counter/turn edit | 1 (`encounter`) | 1 (`encounter.version`) | 1 (encounter) | single reduce + single save |
| `add/removeCombatant` | **2** (`encounter` + `map_instance`) | **2** (both rows' versions) | 1 (encounter) | `guardMany` tx, cross-write (`events.ts:178-236`) |
| `startCombat` | **1 row, 2 writes** (`encounter` session save + status flip) | encounter version bumped **twice** in one tx | 1 (encounter) | `guardMany` tx (`events.ts:245-292`) |
| Combat **move**/spatial | 1 (`map_instance`) | 1 (`map_instance.version`) | 1 (`publishEncounterInstancePing`) | `reduceMapInstance` + single save |

### Is the "single pure reducer / no emits / one version update" property real?

**Yes — and it holds precisely for the in-session overlay events, which is most
of combat.** For `adjustEnemyVitals`, all ailment/condition/counter/turn/economy
events: one pure reducer call, one row, one version bump, one ping, no
transaction, no fan-out (`events.ts:119-128`). This is the cheap, atomic,
trivially-testable path.

**Where it does NOT hold today:**
- **PC vitals** — *not because of `edits[]`*, but because PC vitals were moved
  off the combat path entirely into a **second, independent** write surface
  (`adjust-pools`) against the **character** row with its own `vitalsVersion`.
  The property "one reducer / one version" still holds *per write*, but a fight is
  driven through **two reducers, two row families, two version namespaces, two
  realtime channels** — combat events to the encounter, PC vitals to characters.
- **Roster + spatial coupling** — `add/removeCombatant` and every **move** already
  break "one row / one version": they span `encounter` + `map_instance`
  (`guardMany`, two version tokens). So the codebase **already pays the
  two-row-atomic cost** for the spatial layer; vitals are the remaining state that
  stays single-row.

Net: the prized property is real and valuable for **enemy vitals and the combat
overlay**. It is already **not** a whole-encounter property — PC vitals and
spatial state each live elsewhere with their own versions.

---

## 5. Read path

**DM read:** the console reads the full `encounter.session` directly (no
redaction) plus the Map Instance; PC combatants are hydrated by `characterId` for
their vitals (`load-encounter-snapshot.ts:45-49`, doc `:26-31`).

**Player watch read** — `getEncounterSnapshot(shortId)`
(`apps/web/lib/db/queries/load-encounter-snapshot.ts:35-76`):
1. Load encounter row (the session blob), campaign, Map Instance.
2. For every `pc` combatant, **`loadHydratedCharacterById`** — PC vitals come from
   the **character row**, not the session (`:41-49`).
3. Enemy working HP comes **from the session** (inline statblock / catalog ref),
   resolved via `resolveCatalogEnemyStatblocks` (`:74`).
4. `projectPlayerSnapshot` (`engine/encounter/player-snapshot.ts:228`) redacts:
   the enemy arm of `PlayerVisibleCombatant` has **no `attributes`/`affinities`
   keys at all** — structural, server-side, unconditional (`player-snapshot.ts:31-47,
   75-94`). Enemy HP is shown; enemy attributes/affinities are absent from the JSON
   (not null). Delve fog adds spatial redaction (`:244-273`).

So assembling one snapshot reads: **the encounter row (session: overlay + enemy
vitals) + N character rows (PC vitals) + the Map Instance (positions/zones).**
Vitals come from two different row families today.

**Public API:** `GET /api/encounter/[shortId]/snapshot`
(`app/api/encounter/[shortId]/snapshot/route.ts`) — no auth, returns the redacted
snapshot, 404 on miss.

**Watch poll + invalidation:** `useEncounterSnapshot`
(`hooks/use-encounter-snapshot.ts`) wraps `useSnapshotSubscription` on the
`encounter` channel — **realtime-first, ~1.5s polling fallback**, stopping at
`status === "ended"`. The snapshot carries a **composite version**: `version`
(encounter row) + `instanceVersion` (Map Instance row) (`player-snapshot.ts:109-127`).
The watch tracks **both** and refetches when **either** advances. Pings
(`lib/realtime/publish.ts`) are **advisory metadata only** (touched version
tokens, never domain data): `publishEncounterPing` (`kind:"encounter"`),
`publishEncounterInstancePing` (`kind:"mapInstance"`) on the encounter channel;
`publishCharacterPing` on the **character** channel for PC vitals. All fire via
`after()` post-commit (`publish.ts:71-90`).

**Consequence already in place:** because PC vitals ping the *character* channel,
the watch's encounter subscription does **not** invalidate on a PC-vitals change
unless that PC's sheet is independently subscribed. The two-channel split is an
existing seam, not a hypothetical of v2.

---

## 6. Benefit ledger — what the current "enemy vitals on the session" design buys

Concretely, for the **enemy-vitals + combat-overlay** event class:

1. **Atomicity, free.** Enemy HP, ailments, conditions, counters, turn flags all
   live in one jsonb blob → one `UPDATE` mutates any combination atomically. No
   transaction needed (`events.ts:119-120`).
2. **One optimistic-concurrency token.** A single `encounter.version` guards the
   whole session; the DM is the sole writer, so no per-field versioning, no merge
   logic (`schema/encounter.ts:13-17, 55`).
3. **Pure, data-light reducer testability.** `reduceCombatSession` is
   `(session, event) → session`, no I/O, deterministic, Immer-no-op-preserving;
   tested entirely with fixtures, mutation-tested (`reduce-session.ts:17-37`).
4. **No fan-out writes.** Enemy damage = 1 row, 1 version bump, 1 ping. No N-row
   transaction, no per-enemy row lifecycle.
5. **Snapshot simplicity (enemy half).** Enemy HP is already in the session blob
   the snapshot loader reads — no extra joins for enemies
   (`load-encounter-snapshot.ts:74`).
6. **Redaction is structural.** Enemy data being inline lets the projector simply
   *omit* attribute/affinity keys; nothing leaks because nothing is read
   (`player-snapshot.ts:31-47`).
7. **Realtime simplicity (enemy half).** One encounter-row version → one ping
   stream invalidates all enemy/overlay state at once (`publish.ts`).
8. **Ephemeral lifecycle.** Enemy working HP is born with the encounter and dies
   with it (jsonb) — no durable row to create, migrate, or garbage-collect; a
   catalog enemy is a `{ enemyKey } + 2 numbers` reference, not a copied blob
   (`session.ts:69-87`).

**Caveat the ledger must state honestly:** benefits 1, 2, 4, 7 are **already
partial** at the encounter level. PC vitals live on character rows (4 versions,
separate channel, separate action); roster + every spatial move already span
`encounter + map_instance` via `guardMany` (two versions, a transaction). So the
"single reducer / one version / no fan-out" property is a property of the
**enemy-vitals + overlay slice**, not of the encounter as a whole.

---

## 7. Blast radius — moving combatant working vitals onto durable entity rows

If the `damage`/working-HP depletion moved off the session onto durable entity
rows (PCs + reusable NPC entities), concretely:

**Write path.** `adjustEnemyVitals` stops being a session event. Enemy damage
becomes a write against an entity row (mirroring today's PC `adjust-pools` path).
The combat reducer loses its only vitals-mutating case; the slice
`reduce/enemy-vitals.ts` and the inline `currentHP/maxHP` on the refs
(`session.ts:90-96`) are deleted. The combatant ref collapses toward a pure
`{ entityId }` pointer for *all* kinds — symmetric with today's `pc` arm. This is
architecturally cleaner (one vitals mechanism instead of two), which is the real
upside.

**Version bumps / atomicity.** This is the cost. Today a multi-target combat
moment (AoE hitting 3 enemies + 1 PC) is, per write, cheap and independent. With
durable entity vitals:
- A single-enemy damage: still 1 row / 1 version — **no worse** than today, and it
  unifies with the PC path.
- But any event that **simultaneously** touches an entity's vitals **and** the
  session overlay (e.g. "apply Burn tick: −10% HP + the ailment state") now spans
  **2 rows** (entity + encounter) and **2 version tokens** → must become a
  `guardMany` transaction (the pattern already exists, `events.ts:209-227`). Today
  that Burn HP apply is handed to the DM as a separate enemy HP nudge precisely
  *because* it'd cross the PC boundary (`end-of-turn.ts:102-132`); making enemy
  vitals durable forces the same cross-row transaction the PC case already needs.
- **End-of-combat / multi-target**: N affected combatants → up to **N entity-row
  writes + N version bumps + 1 encounter write** in one transaction, vs. today's
  single session `UPDATE`. The atomic unit grows from 1 row to `1 + N`.

**Snapshot read.** Already half-joined (PC vitals are N character-row loads,
`load-encounter-snapshot.ts:45-49`). Enemy vitals moving to entities makes it
**fully** join-based: every combatant's vitals now come from an entity row, so the
loader fetches `1 + (all combatants)` rows instead of `1 + (PC combatants)`. More
queries, but it's the *same shape* already in place for PCs — `Promise.all` over
ids. Catalog-enemy identity still resolves from the hardcoded data; only the
working numbers relocate.

**Realtime.** The encounter ping currently invalidates all enemy vitals in one
shot. With durable entity vitals, an enemy-HP change bumps an **entity** version,
not `encounter.version` → the watch must subscribe to (or poll) entity versions
too, or the encounter ping must be made to fire on entity writes. This is the
**same** seam that already exists for PCs (PC vitals ping the character channel,
not the encounter channel — §5). So it generalizes an existing split rather than
inventing one; the snapshot's composite version would grow from
`{encounter, instance}` to include an entity-version dimension (e.g. a max/hash
over combatant entity versions).

**Honest assessment.** The "single pure reducer / no emits / one version" property
is **genuinely valuable but already localized** to the enemy-vitals + overlay
slice — PCs and spatial state don't have it today. Moving enemy vitals to durable
entities:
- **Loses**: the no-transaction, single-version atomicity of the enemy-vitals
  slice; the zero-extra-query enemy half of the snapshot; the
  one-ping-invalidates-all-enemy-state simplicity. Quantified: multi-target events
  go from 1 row/1 version to `1+N` rows/`1+N` versions in a transaction; the
  snapshot adds `(#enemies)` row loads; realtime gains an entity-version stream.
- **Gains**: **one** vitals mechanism instead of two (PC and enemy paths unify);
  reusable NPCs that persist HP across encounters (impossible with ephemeral
  jsonb); the combatant ref collapses to a uniform `{ entityId }`. The transaction
  + composite-version + join-read machinery this requires **already exists** in the
  codebase (`guardMany`, the PC `adjust-pools` path, the composite snapshot
  version, the per-character ping channel) — so the blast radius is *generalizing
  three patterns already present*, not building new infrastructure.

The decision is therefore: **keep a cheap single-row atomic slice for the most
frequent combat write (enemy HP), at the cost of two parallel vitals mechanisms;
vs. unify on durable entities, paying per-event transaction/version/join cost that
the PC and spatial layers already pay.**

---

## Benefit ledger (summary)

Atomic single-row enemy/overlay writes · one `encounter.version` · pure
fixture-tested reducer · no fan-out (1 row, 1 bump, 1 ping per enemy hit) ·
zero-extra-query enemy snapshot · structural redaction by omission · one ping
invalidates all enemy state · ephemeral jsonb lifecycle (no NPC row to manage).
**All scoped to the enemy-vitals + overlay slice — PC vitals and spatial state
already live off-session with their own versions/channels/transactions.**

## Blast radius (summary)

Per-event cost rises from 1 row / 1 version (no tx) to `1+N` rows / `1+N`
versions in a `guardMany` transaction for any event mixing entity vitals with the
session overlay or hitting multiple targets; the snapshot adds `(#enemies)` row
loads (PCs already do this); realtime gains an entity-version stream folded into
the composite snapshot version. **None of this is new machinery** — `guardMany`,
the PC `adjust-pools` write path, the composite `{encounter, instance}` version,
and per-row ping channels all exist today. The trade is "cheap ephemeral
single-row enemy vitals + two parallel vitals mechanisms" vs. "uniform durable
entity vitals + the cross-row cost the PC and spatial layers already pay."
