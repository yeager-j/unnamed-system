# `domain/combat/replica/` — the combat binding (UNN-646, Replica Phase 4)

Combat's two persistence homes bound to `@workspace/replica`, replacing the
per-PC queue/token machinery (`write-lanes.ts`, `pc-ping.ts`,
`useMonotonicVersionMap`) and the classic encounter write-router
(`applyCombatantWriteAction` + the two Stores). `packages/replica` learned
nothing about combatants: the durable/inline distinction is decided ONCE at
this binding's ownership decision point (`useCombatReplicas.handleOf`, the
sole reader of `ParticipantMeta.storage`), which returns the appropriate
replica's write handle.

## The granularity decision (design doc Open decision 7 — resolved here)

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

- **Inline home → ONE collection-valued replica per encounter.** All inline
  participants share one row (the session blob), one scalar version, one gate
  (campaign-DM), one lifetime (the encounter). Per-participant inline replicas
  would fabricate N cursors over one token.
- **Fan-in is a transport concern, orthogonal to granularity**: the console
  stays the single Ably subscriber and fans pings into N transports
  (`onPcPing` / `notifyEncounterPing`); it never merges roots. A single
  replica spanning both homes was rejected — it would need an atomic accepted
  observation across N entity rows plus the blob, i.e. the cross-replica
  transaction the design's first version explicitly does not coordinate.

**Cursors (Open decision 8 evidence):** durable = the full per-class
`EntityVersionVector` (all combat arms are vitals-class today, but lifecycle
actions can touch root components under other classes; the vector is free and
mixed races resolve `unknown → recovery read`). Inline = the scalar encounter
`version` — the two-row (encounter + instance) pressure the Phase-2 notes
flagged does NOT reach this root: no instance-governed fact appears in it, so
a vector would be ceremony. Scalar cursors are totally ordered, so the
`incomparable-cursors` transport law is deliberately omitted for the inline
binding (the alien polling precedent), with the law list re-asserted by name.

**Remote (Open decision 6 evidence):** the session door is the first
production non-void `Remote` — `{ version }`, the committed encounter
version, recorded with the outcome and reproduced verbatim on deduplicated
redelivery. `useCombatantWrite` folds it into the surviving event queue's
token so the two protocols sharing the encounter row keep each other fresh.

**The inline caveat, recorded honestly:** inline state has one writer in
practice (the DM). Its replica is justified by at-most-once delivery on retry
(double-applied damage was the scariest write class; the classic queue had no
ambiguous-failure retry at all) and by decision-point uniformity — not by
multi-writer evidence.

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
   enchantment) on the generic event wire (`dispatch-event.ts`).

`lib/sync/write-queue.ts` / `use-queued-write.ts` therefore survive as the
event wire's protocol (encounter + instance queues; dungeon/stage remain
importers) — only the per-PC lane cardinality retired.

## Redaction posture

Both roots are the structural narrowing `pickCombatComponents` — exactly the
four combat-writable components (`vitals | skillPool | resources |
mechanics`), never narrative, columns, or anything the visibility table
drops. The batched bootstrap door (`loadCombatAcceptedAction`) is
campaign-DM-gated and roster-scoped; the entity snapshot door's strict-owner
reservation ("a DM-facing replica needs a narrower root, not this bag behind
a wider gate") is answered by this root, not widened around.

## Render authority and fallback (UNN-653)

Replica projections are the sole render and prediction authority for the four
combat-writable components. `useCombatReplicas` publishes only ready roots
through an application-owned external store; `composeCombatModel` joins those
roots onto the classic event frame by durable entity ID or inline participant
ID. The join replaces the complete four-key subset, so an absent capability in
accepted state cannot survive from an older RSC frame. Identity, presentation,
other components, roster, turns, overlays, and spatial state remain owned by
the event frame.

Fallback is per root. Before bootstrap, when loader metadata is absent, or when
an accepted inline collection does not contain a participant, the current RSC
participant remains unchanged. Identity expiry removes the retired projection
immediately and falls back to that frame while a fresh identity bootstraps; the
old projection may contain discarded predictions and must not remain visible.
Removing a participant gates its handle and controller membership from the
current roster even if loader metadata is temporarily stale.

Accepted component advances do not refresh the route: the external-store
subscription is the reconciliation path and the first visible update never
depends on an RSC replacement. Encounter and reconnect refreshes remain for
roster, turns, overlays, and spatial facts still owned by the classic event
protocol. The inline replica still returns `{ version }` so
`useCombatantWrite` can advance that protocol's encounter-row token; UNN-656 is
the removal condition.

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
| `mutations.ts`                   | The two roots + registries (`combat.entity.write`, `combat.session.write`) and `pickCombatComponents`                                                                    |
| `rejection.ts`                   | `CombatReplicaRejection` + `CombatWriteDispatchError`                                                                                                                    |
| `identity.ts`                    | `combat-entity:{entityId}` / `combat-session:{encounterId}` mints                                                                                                        |
| `events.ts`                      | Client observability (anomalies warn; routine traffic quiet)                                                                                                             |
| `use-combat-replicas.ts`         | Keyed lifecycle over `createManagedReplica` + `createPullTransport`; batched bootstrap + failure classification; roster diff; ready-snapshot external store; `settleAll` |
| `../compose-combat-model.ts`     | Pure join from per-root Replica projections onto the event-owned encounter frame                                                                                         |
| `replica-binding.test.ts`        | Both contract suites over in-memory worlds (full law lists asserted by name)                                                                                             |
| `real-door-transport.db.test.ts` | Transport contract + SQL serialization against the real doors (run via `npm run test:replica-db`)                                                                        |

The authority half lives in `lib/actions/combat/replica/` (see
`lib/actions/AGENTS.md`); the sources in `lib/sync/combat-replica-source.ts`
over the shared `replica-push.ts` pacing policy.
