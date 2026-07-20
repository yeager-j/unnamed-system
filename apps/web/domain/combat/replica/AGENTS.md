# `domain/combat/replica/` — the combat binding (UNN-646; Encounter session intent UNN-656)

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
  participants as _references_. Everything in the value comes from one row, so
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

**Remote (Open decision 6 evidence, deferred to UNN-657):** the encounter door is the first
production non-void `Remote` — `{ version }`, the committed encounter
version, recorded with the outcome and reproduced verbatim on deduplicated
redelivery. Component and session-intent bindings fold it into the surviving
command queue's token so the two protocols sharing the encounter row keep
each other fresh. UNN-656 removed ordinary session events from that queue,
but start/add/remove, catalog-enemy materialization, standalone end, and
dungeon end still use expected encounter versions. **UNN-657 owns removal of
that coordinator, `fetchEncounterVersion`, the recorded `{version}` Remote,
and restoration of `Remote = void`.**

**One apply, both sides (UNN-655/656).** `writeEncounterInline` decides the
liveness precondition (`encounter-not-live`), the locator-derived home
(`participant-not-inline` — a durable-addressed write fails closed), the
roster miss, and Writer validation inside the registered apply. The client
predicts and rebases with it; the authority builds the root from the locked
row and commits with the same function, then persists via the **total**
`serializeSessionShell` (the fail-closed locator-map serializer arm — and its
`"locator-missing"` rejection — became unrepresentable). UNN-656 adds one
stable named mutation per session intent; there is no generic session-event
mutation. The game-v2 shell-intent module returns typed `Result` refusals, and
the legacy total reducer adapts through the same operations. The obsolete
router-only component-event constructors and reducer arms are deleted.

### UNN-656 mutation classification

| Intent                                    | Replica contract                                                                                                                                |
| ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| draft combatant                           | Preconditioned on round, current actor, target side, and target turn count; Fallen stays advisory because durable vitals are outside this root. |
| end turn                                  | Preconditioned on actor, round, and actor turn count.                                                                                           |
| advance round                             | Minted only from a composed round-complete view; preconditioned on round, actor, roster order, and participant turn counts.                     |
| set current actor / set acted             | Desired value with current-frame preconditions; unknown participants refuse.                                                                    |
| set round                                 | Replayable desired value.                                                                                                                       |
| set side                                  | Replayable desired value in draft or live; ended refuses.                                                                                       |
| condition axis                            | Increase/decrease replay extend/flip; clear is desired neutral.                                                                                 |
| condition flag / ailments / clear counter | Replayable desired values.                                                                                                                      |
| counter / action economy adjustment       | Replayable additive non-zero integer operations.                                                                                                |
| start / add / remove / encounter end      | Command-only; no Replica mutation.                                                                                                              |
| component writes                          | Existing `encounter.writeInline` and `combat.entity.write` vocabulary.                                                                          |

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
4. `addCatalogEnemiesAction` (catalog materialization plus roster/placement).

Spatial intent uses the separate Map Instance Replica. The surviving encounter
writer inventory is therefore exactly start/add/remove, catalog-enemy
materialization, standalone end, and dungeon end. No ordinary session intent
uses `applyCombatEventAction`.

`lib/sync/write-queue.ts` / `use-queued-write.ts` therefore survive for the
command-only encounter coordinator (dungeon/stage remain importers) until
UNN-657.

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
The composition seam renders the full inline stored entity from this root.
Player-facing surfaces keep deriving their redaction from composed views —
never from the widened DM root.

## Render authority and fallback (UNN-653; widened by UNN-656)

Replica projections are the sole render and prediction authority for migrated
session facts and combat-writable components. `useCombatReplicas` publishes
only ready roots; `composeCombatModel` joins them onto the command-owned RSC
frame. A ready Encounter root owns round, current actor, participant overlays,
and full inline stored entities. Command-owned roster shape and durable
hydration remain on the loader frame until UNN-657; durable combat components
come from Entity Replicas and spatial state from the Map Instance Replica.

Fallback is per root. Before bootstrap, when loader metadata is absent, or when
a ready encounter shell does not contain a participant, the current RSC
participant remains unchanged. Identity expiry removes the retired projection
immediately and falls back to that frame while a fresh identity bootstraps; the
old projection may contain discarded predictions and must not remain visible.
Removing a participant gates its handle and controller membership from the
current roster even if loader metadata is temporarily stale.

Accepted advances and reconnects do not refresh the route merely to converge:
invalidation plus pull is the reconciliation path. A refresh is scheduled only
when the accepted root reveals lifecycle, roster, or locator shape that
diverges from the command-owned loader frame.

Replay refusal removes the prediction immediately during Replica rebase and is
logged as a conflict. It does not toast at that intermediate point. The later
authoritative terminal rejection travels through the mutation receipt and
produces the one user-facing combat-error toast.

## Container convergence (Open Q5) — resolved by UNN-653

The console's `useOptimistic` container now predicts only paired-roster
commands. Session and component state are composed from Replica snapshots,
which deletes the duplicate Writer prediction and the transition formerly held
until `remote` settled. This is a Showtime composition seam, not a generic
managed-replica-set abstraction in `@workspace/replica`.

## UNN-656 production delta

The implementation diff changes production code by **+1,422 / -980 lines
(net +442)**, excluding tests, E2E, and decision records. The gross addition
is primarily the explicit named mutation schemas, the pure shell-intent rules,
and the client receipt binding. The deletion removes the generic optimistic
event arm, component-event vocabulary, and the old per-family reducer
implementations.

The application-specific result is less favorable. Counting source code in
`apps/web` only—excluding tests/E2E, JSON, Markdown and decision records, blank
lines, comment-only lines, and generated `next-env.d.ts`—the app grew from
**67,982 to 68,581 lines: +599 (+0.9%)**. UNN-656 achieved its behavioral
migration but did **not** achieve application contraction. Ordinary session
prediction/order/retry/rebase and refusal have one home in the Encounter
Replica, while the classic queue still coordinates the six enumerated command
writers.

UNN-657 owns deletion—not another wrapper—of the transitional layer: recorded
Encounter `Remote = { version }`, session/inline `onRemoteVersion` folds, live
and setup `encounterWrite` / `useQueuedWrite`, `fetchEncounterVersion`,
expected-version command envelopes and stale retry, and the surviving classic
combat command router/action. Its completion review must measure cumulative
`apps/web` responsibility and LOC; if the coordination surface does not
contract materially, Replica stabilization stops for architectural review.

## Files

| File                             | Role                                                                                                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `mutations.ts`                   | The two root families, stable named Encounter intent mutations, invocation preparation, `EncounterReplicaState`, and `pickCombatComponents`                              |
| `rejection.ts`                   | `CombatReplicaRejection` + `CombatWriteDispatchError`                                                                                                                    |
| `identity.ts`                    | `combat-entity:{entityId}` / `encounter:{encounterId}` mints                                                                                                             |
| `events.ts`                      | Client observability (anomalies warn; routine traffic quiet)                                                                                                             |
| `use-combat-replicas.ts`         | Keyed lifecycle; draft/live Encounter bootstrap, live-only durable roots, session-intent dispatch, ready snapshots, and `settleAll`                                       |
| `../compose-combat-model.ts`     | Pure join from per-root Replica projections onto the command-owned loader frame plus the command-divergence refresh predicate                                            |
| `replica-binding.test.ts`        | Both contract suites over in-memory worlds (full law lists asserted by name)                                                                                             |
| `real-door-transport.db.test.ts` | Transport contract + SQL serialization + accepted-tuple atomicity against the real doors (run via `npm run test:replica-db`)                                             |

The authority half lives in `lib/actions/combat/replica/` (see
`lib/actions/AGENTS.md`); the sources in `lib/sync/combat-replica-source.ts`
over the shared `replica-push.ts` pacing policy. The storage-native
`SessionShell` (load/serialize + round-trip laws) lives in
`packages/game-v2/src/encounter/session-shell.ts`.
