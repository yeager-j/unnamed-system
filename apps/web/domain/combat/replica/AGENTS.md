# `domain/combat/replica/` — the combat binding (UNN-646 P4; storage-native encounter root UNN-655)

Combat's two persistence homes bound to `@workspace/replica`, replacing the
per-PC queue/token machinery (`write-lanes.ts`, `pc-ping.ts`,
`useMonotonicVersionMap`) and the classic encounter write-router
(`applyCombatantWriteAction` + the two Stores). `packages/replica` learned
nothing about combatants: the durable/inline distinction is decided ONCE at
this binding's ownership decision point (`useCombatReplicas.handleOf`, the
sole reader of `ParticipantMeta.storage`), which returns the appropriate
replica's write handle.

## The granularity decision (design doc Open decision 7 — resolved here, re-proved by UNN-655)

**Replica granularity follows the authority's commit scope — the row-lock +
auth boundary — never the UI's dispatch scope.**

- **Durable home → one replica per durable participant's entity row.** Each PC
  has its own row lock, its own auth answer (class→posture over the entity's
  campaign placement), its own cursor (the entity class vector), and its own
  lifetime (roster membership; the entity outlives the encounter). A
  collection-valued durable replica would need a product cursor over N rows
  and a group auth gate that doesn't exist.

  **Correction earned in review — the commit scope is wider than one row.** The
  first version of this record said the durable root's authority boundary _was_
  the entity row's lock. It isn't: a durable combat write is licensed by the
  encounter being live and the entity still being on its roster, and both facts
  live on the encounter row. They were checked outside the committing
  transaction, so a removal or an end-combat sweep could land in between and the
  delivery would still write to the character. The durable transaction now locks
  **`replicaClient` → `encounters` → `entity`**. The granularity conclusion
  survives (per-entity roots, per-entity cursors) but the rule it rests on has
  to be read strictly: _follow the authority's commit scope_ means every lock
  the commit actually needs, not the most obvious one. A precondition checked
  outside the transaction that acts on it is not a precondition — rebase can
  correct a client projection, never an authority commit.

- **Encounter home → ONE storage-native replica per encounter row (UNN-655,
  superseding the inline-only `CombatInlineState` root).** Its value is the
  row's own atomically stored facts — `{ status, session: SessionShell }`:
  scalars, ordered roster, overlays, inline entities whole, durable
  participants as *references*. Everything in the value comes from one row, so
  one joined statement yields one consistent `{ value, through, cursor }`
  observation with zero hydration; hydrated durable components and Map
  Instance state are **structurally absent** (they live under other rows'
  locks, gates, cursors, and lifetimes) — the atomicity invariant "an
  encounter watermark can never be paired with separately read entity state"
  holds by shape, pinned by the real-door atomicity tests. The runtime
  `Session` could never be this root: dissolving durable references into
  entity values is exactly the cross-row read the tuple must not contain.
- **Fan-in is a transport concern, orthogonal to granularity**: the console
  stays the single Ably subscriber and fans pings into N transports
  (`onPcPing` / `notifyEncounterPing`); it never merges roots. A single
  replica spanning both homes was rejected — it would need an atomic accepted
  observation across N entity rows plus the blob, i.e. the cross-replica
  transaction the design's first version explicitly does not coordinate.

**Cursors (Open decision 8 evidence):** durable = the full per-class
`EntityVersionVector` (all combat arms are vitals-class today, but lifecycle
actions can touch root components under other classes; the vector is free and
mixed races resolve `unknown → recovery read`). Encounter = the scalar
encounter `version` — no instance-governed fact appears in the root, so a
vector would be ceremony. Scalar cursors are totally ordered, so the
`incomparable-cursors` transport law is deliberately omitted for the encounter
binding (the alien polling precedent), with the law list re-asserted by name.

**Remote (Open decision 6 evidence):** the encounter door is the first
production non-void `Remote` — `{ version }`, the committed encounter
version, recorded with the outcome and reproduced verbatim on deduplicated
redelivery. `useCombatantWrite` folds it into the surviving event queue's
token so the two protocols sharing the encounter row keep each other fresh.
Kept by UNN-655 because the asynchronous accepted pull cannot keep that
queue's token fresh at commit time; **removal condition: UNN-656 retiring the
encounter event queue**, at which point the door reverts to `Remote = void`.

**One apply, both sides (UNN-655).** `writeEncounterInline` decides the
liveness precondition (`encounter-not-live`), the locator-derived home
(`participant-not-inline` — a durable-addressed write fails closed), the
roster miss, and Writer validation inside the registered apply. The client
predicts and rebases with it; the authority builds the root from the locked
row and commits with the same function, then persists via the **total**
`serializeSessionShell` (the fail-closed locator-map serializer arm — and its
`"locator-missing"` rejection — became unrepresentable). The previous
authority body (`mintSessionEvent → createReduceSession`) was retired with a
semantic-preservation property proving the swap exact; the engine's
`ComponentWriteEvent` reduce slices are production-unreachable until UNN-656
decides their reuse or retirement.

**The single-writer caveat, recorded honestly:** encounter-row state has one
writer in practice (the DM). Its replica is justified by at-most-once delivery
on retry (double-applied damage was the scariest write class; the classic
queue had no ambiguous-failure retry at all) and by decision-point
uniformity — not by multi-writer evidence.

## What stays application-level (cross-root commands, enumerated)

A replica root projects ONE mutation deterministically; operations that
atomically change two roots stay ordinary `useQueuedWrite` Server Actions:

1. `endCombatAction` (session + instance + status) and
   `endDungeonCombatAction` (+ the dungeon turn; lock order dungeon →
   mapInstance → encounter).
2. `addParticipant` — durable hydration (`{ entityId }`, server-hydrated) and
   the inline paired add (session + occupancy).
3. `removeParticipant` (paired occupancy sever).
4. Spatial `MapInstanceEvent`s (paired encounter/instance tokens).
5. Every other session event (advanceTurn, draft, conditions, zone
   enchantment) on the generic event wire (`dispatch-event.ts`) — their
   migration onto this root is UNN-656.

`lib/sync/write-queue.ts` / `use-queued-write.ts` therefore survive as the
event wire's protocol (encounter + instance queues; dungeon/stage remain
importers) — only the per-PC lane cardinality retired.

## Redaction posture

**Durable roots** are the structural narrowing `pickCombatComponents` —
exactly the four combat-writable components (`vitals | skillPool | resources |
mechanics`), never narrative, columns, or anything the visibility table
drops; the entity snapshot door's strict-owner reservation ("a DM-facing
replica needs a narrower root, not this bag behind a wider gate") is answered
by that narrowing, not widened around.

**The encounter root serves the row whole (UNN-655 posture change,
user-approved):** inline entities and overlays are DM-authored facts of the
DM's own encounter row, and the batched bootstrap door is campaign-DM-gated —
the gate is the license, so a storage-native value needs no narrowing (and a
narrowed value could not serialize back or project future session mutations).
The composition seam still narrows inline *projections* to the four combat
keys before folding them onto the frame, and player-facing surfaces (the
polled watch snapshot) keep deriving their redaction from composed views —
never from a widened root.

## Render authority and fallback (UNN-653; scope held by UNN-655)

Replica projections are the sole render and prediction authority for the four
combat-writable components. `useCombatReplicas` publishes only ready roots
through an application-owned external store; `composeCombatModel` joins those
roots onto the classic event frame — durable components by entity ID, inline
components read from the encounter root's shell by roster ID. The join
replaces the complete four-key subset, so an absent capability in accepted
state cannot survive from an older RSC frame. Identity, presentation, other
components, roster, turns, overlays, and spatial state remain rendered from
the event frame **deliberately**: their writes still ride the classic wire,
whose predictions are kept visible by the RSC payload advancing the
`useOptimistic` base within the write's own transition — moving those facts
onto the replica projection before their intents ride it (UNN-656) would
revert classic predictions at transition end. UNN-656 widens the seam in
place; the seam's shape already receives the full encounter projection.

Fallback is per root. Before bootstrap, when loader metadata is absent, or when
a ready encounter shell does not contain a participant, the current RSC
participant remains unchanged. Identity expiry removes the retired projection
immediately and falls back to that frame while a fresh identity bootstraps; the
old projection may contain discarded predictions and must not remain visible.
Removing a participant gates its handle and controller membership from the
current roster even if loader metadata is temporarily stale.

Accepted component advances do not refresh the route: the external-store
subscription is the reconciliation path and the first visible update never
depends on an RSC replacement. Encounter and reconnect refreshes remain for
roster, turns, overlays, and spatial facts still owned by the classic event
protocol.

Replay refusal removes the prediction immediately during Replica rebase and is
logged as a conflict. It does not toast at that intermediate point. The later
authoritative terminal rejection travels through the mutation receipt and
produces the one user-facing combat-error toast.

## Container convergence (Open Q5) — resolved by UNN-653

The console's `useOptimistic` container now predicts only event, paired-roster,
and spatial actions. Combat component state is composed from Replica snapshots,
which deletes the duplicate Writer prediction and the transition formerly held
until `remote` settled. This is a Showtime composition seam, not a generic
managed-replica-set abstraction in `@workspace/replica`.

## Files

| File                             | Role                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mutations.ts`                   | The two root families + registries (`combat.entity.write`, `encounter.writeInline`), `EncounterReplicaState`, and `pickCombatComponents`                                 |
| `rejection.ts`                   | `CombatReplicaRejection` + `CombatWriteDispatchError`                                                                                                                    |
| `identity.ts`                    | `combat-entity:{entityId}` / `encounter:{encounterId}` mints                                                                                                             |
| `events.ts`                      | Client observability (anomalies warn; routine traffic quiet)                                                                                                             |
| `use-combat-replicas.ts`         | Keyed lifecycle over `createManagedReplica` + `createPullTransport`; batched bootstrap + failure classification; roster diff; ready-snapshot external store; `settleAll` |
| `../compose-combat-model.ts`     | Pure join from per-root Replica projections onto the event-owned encounter frame                                                                                         |
| `replica-binding.test.ts`        | Both contract suites over in-memory worlds (full law lists asserted by name)                                                                                             |
| `real-door-transport.db.test.ts` | Transport contract + SQL serialization + accepted-tuple atomicity against the real doors (run via `npm run test:replica-db`)                                             |

The authority half lives in `lib/actions/combat/replica/` (see
`lib/actions/AGENTS.md`); the sources in `lib/sync/combat-replica-source.ts`
over the shared `replica-push.ts` pacing policy. The storage-native
`SessionShell` (load/serialize + round-trip laws) lives in
`packages/game-v2/src/encounter/session-shell.ts`.
