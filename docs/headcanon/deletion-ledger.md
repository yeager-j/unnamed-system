# Headcanon deletion ledger

**Purpose:** the [technical design](./technical-design.md)'s _application
contraction gate_ — "package growth is acceptable; application coordination
growth is not." Each Showtime cutover records what `apps/web` actually lost, so
the deletion test (not the estimate) decides whether the package is deep.

**Method:** `cloc` over the changed files at the branch point vs. the tip,
counting **code lines only** — comments and blank lines excluded, test files
tallied separately. Package code is deliberately out of scope.

---

## Phase 2 — character route (UNN-676, P2d)

Estimate from [deep-review-outcome.md §2](./deep-review-outcome.md): −300 to
−500 net production lines.

### Measured: **+38 net production code lines in `apps/web`**

The single number is misleading on its own, because two opposite movements are
inside it.

#### Coordination deleted: −297

| Lines | What went                                                                                                                                                                               |
| ----: | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
|   −78 | `domain/entity/use-entity-write.tsx` (326 → 248 code; 489 → 373 total) — every queue, version ref, token port, refetch, `enqueue` variant, realtime ping listener, and retry dispatcher |
|   −54 | `lib/actions/entity/mutations/apply-identity.ts` — the transitional identity door, with its legacy ping bridge and server-minted mutation IDs                                           |
|   −56 | `lib/actions/entity/apply-entity-write.ts` + its schema — the legacy character door                                                                                                     |
|   −39 | the four identity leaves (name, pronouns, notes, portrait) — they no longer import Server Actions at all, only per-field descriptors                                                    |
|   −31 | the three planner autosave hooks — the CAS ceremony they were faking (`version: 0`, `action(0)`)                                                                                        |
|   −11 | `domain/entity/use-debounced-auto-save.ts` — `dispatchWrite`, the `expectedVersion` parameter, the `"stale"` branch                                                                     |
|    −5 | `lib/actions/entity/entity-mutation.schema.ts` — `entityMutationBase`, orphaned once finalize read its own guard                                                                        |
|   −23 | the remaining call sites: `stale` toast copy, `useEntityIdentityQueue` consumers, builder step, finalize                                                                                |

#### Capability added: +261

| Lines | What arrived                                                                                                               |
| ----: | -------------------------------------------------------------------------------------------------------------------------- |
|  +124 | `lib/realtime/axis-invalidations.ts` — the client axis-invalidation transport (**new liveness**, not a swap)               |
|   +55 | `domain/entity/use-entity-predictions.ts` — the send adapter + root family                                                 |
|   +41 | `app/api/realtime/token/route.ts` — axis capability validation + the namespace endpoint                                    |
|   +41 | `lib/actions/entity/mutations/apply.ts` — the one door for both mutations, incl. the **transitional** Phase-3a ping bridge |

The −300..−500 estimate priced a like-for-like swap. It did not price (a) wiring
realtime _up_ to the new architecture — deleting the ping listener without an
axis subscriber would have regressed cross-tab and DM-writes-to-sheet liveness —
or (b) the two bridges that _partial_ adoption forces, both of which Phase 3a
deletes:

- the entity door republishes accepted mutations as legacy `character:{shortId}`
  pings for the dungeon watch. Combat's listener and standalone external
  finalizer were deleted in P3a.

#### Tests: −256 net lines, and the composition changed

| Lines | File                                                                                                                                                                                                         |
| ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
|  −189 | `mutations/apply-identity.test.ts` (door deleted)                                                                                                                                                            |
|  −166 | `use-debounced-auto-save.test.ts` — version threading, stale refetch, second-stale rollback                                                                                                                  |
|  −118 | `use-entity-write.test.tsx` — queue serialization, class isolation, token forwarding, ping comparison, echo suppression, reconnect                                                                           |
|  +217 | app-semantics and boundary coverage: door bridge/authorization (+89), token-route axis capabilities (+70), RSC-serializability of the mount (+40), external-commit finalization (+15), pre-check return (+3) |

This is the AC's "coordination tests move to package contracts; the app keeps
predictor-refusal, error-mapping, and autosave-semantics tests only." What
remains in `use-entity-write.test.tsx` is predictor refusal, refusal-handler
suppression, wire-envelope shape, lifecycle→toast mapping, the predicted
identity overlay, canonization settling, and autosave settle semantics.

### The gate: passed

The hard requirement was never the number — it was _"if the existing provider
remains intact around or under `mutate`, the spike stops before Phase 3."_
Nothing wraps `mutate` to re-decide delivery, versions, or freshness. Queues,
version refs, stale refetch, realtime comparison, refresh scheduling, and
canonization no longer exist in this binding.

### Deviations from the ticket's ACs

- **No feature flag.** Decided with the user: this is a long-lived epic branch,
  so a revert is the rollback and a flag would have meant keeping the machinery
  the ticket exists to delete. The AC's flag clause and its deletion clause were
  in direct tension; deletion won.
- **`lib/sync/character-version-sync.ts` survives.** Combat's use fell in P3a,
  but the dungeon explore body still imports it. P3a did delete
  `version-token-store.ts`, `getEntityClassVersionAction`, and combat's
  `write-lanes.ts` / `pc-ping.ts`; the encounter and instance queues remain for
  generic events until P3b/P3c.

### Carried forward to Phase 3a

The bridges above, plus: `apps/web/lib/sync` still holds a synchronization
runtime for the un-migrated bindings, and `guard-write-transition` remains
app-owned (finalize, builder step, and portrait upload are outside the protocol
by design).

---

## Phase 2g — mutation registration seam (UNN-685)

The P2g prototype replaces Showtime's distributed registration layer with the
typed command manifest selected in the
[mutation-seam investigation](./mutation-seam-investigation.md).

### Measured: **−57 net production code lines in `apps/web`**

#### Coordination deleted: −316

| Lines | What went                                                                                                                        |
| ----: | -------------------------------------------------------------------------------------------------------------------------------- |
|  −186 | target parsers, three `execute-*` adapters, the string-keyed executor map, broad server rejection union, and cast receipt parser |
|   −43 | the Server Action's manual mutation dispatcher and projection branch ladder                                                      |
|   −42 | the client binding's authorization filtering and generic delivery-outcome mapping                                                |
|   −15 | the standalone throwing preauthorization wrapper superseded by command admission                                                 |
|   −30 | unreachable `entity-not-found` UI branches; missing or unauthorized targets are now package denial                               |

#### Domain capability added or reshaped: +259

| Lines | What arrived                                                                                                                   |
| ----: | ------------------------------------------------------------------------------------------------------------------------------ |
|  +176 | one server-only command module holding the three mutations' real admission, transaction, and repeat-safe projection policy     |
|   +53 | attempt-local admitted Store halves; combat's one-call `commitEntityWrite` composes the exact same entity-write implementation |
|   +30 | mutation-specific refusal codecs and correlated app typing, including the structured finalize refusal                          |

Package code is outside this measure. It grows the reusable action, binding,
denial, refusal-recovery, and client-delivery contracts that delete the app
coordination above. The prototype's cleanup pass also deletes the superseded
`createNextMutationExecutor`/`createMutationExecutor`, `MutationHandlers`, and
protocol-wide `rejections<T>()` surfaces, so package consumers have one
definition-keyed registration interface rather than two competing shapes.

#### Tests: −271 net app code lines

The app deletes 473 code lines of parser/dispatcher/delegate tests and adds 202
code lines around application command semantics. Generic admission ordering,
denial receipts, retry, duplicate accepted projection, corrupt refusal handling,
three-axis stamps, and binding falsification now live in package contract tests.

### The gate: passed

The application diff contracts and no old dispatcher remains around the new
action. A fourth mutation registers through its client-safe definition, one
command binding, its domain operation, and its caller; it does not edit a target
parser, action branch, handler map, union parser, client sender, authority, cache
invalidator, or realtime publisher.

---

## Phase 3a — combat binding (UNN-678)

### Measured: **−227 net production code lines in `apps/web`**

`cloc --diff` at the ticket branch point reports 416 added and 643 removed
production TypeScript/JavaScript code lines (modified lines are net-neutral).
The important contraction is conceptual as well as numeric:

- removed the per-character write lanes, monotonic version map, stale-version
  refetch action, character ping comparison, listeners, and manual external
  commit finalizer;
- replaced the legacy combat action/schema/two-Store router with one registered
  `showtime.combat.v1` command whose durable arm composes `commitEntityWrite`;
- added one snapshot-consistent combat canon and one thin predicted-root binding;
  and
- shrank the app's lazy transport wrapper to configuration over the
  package-owned lazy adapter shared by both root families.

#### Tests: **−379 net app code lines**

`cloc --diff` reports 490 added and 869 removed test code lines. Deleted tests
asserted per-character queues, stale refetch, ping comparison, and manual action
finalization. The replacements cover combat prediction, registered-command
routing/authorization/stamps/contention, the consistent loader and dynamic axis
set, opaque axes, lazy initialization, and the two-root shared-axis negative
control. Generic duplicate delivery and receipt behavior remain package contract
tests.

### The gate: passed

Combat component writes contain no client version protocol, storage-home claim,
per-character realtime channel, or app-owned receipt finalization. Generic
encounter/instance event queues and public snapshot watchers remain intentionally
for P3b/P3c.

---

## Phase 3b — dungeon multi-axis binding (UNN-679)

### Measured: **−466 net production code lines in `apps/web`**

`cloc --diff` at the ticket branch point reports 1,145 added and 1,611 removed
production TypeScript code lines. The capability grew a server-authoritative
dungeon command because six separate Server Actions became one transaction
boundary, while the route binding contracted around it:

- removed the dungeon and map-instance version queues, token refs, stale
  refetch actions, nested two-lane acquisition, `run-dual-versioned-write`, and
  the exploration dispatch router;
- removed the version-bearing event, search-and-reveal, delve start,
  expedition start/finish, status, encounter-start, and route-specific
  combat-end actions and schemas;
- replaced them with one intent-only `showtime.dungeon.v1` command, one
  snapshot-consistent dungeon canon, and one predicted-root binding mounted in
  prep, exploration, and encounter staging; and
- moved `combat.end` into `showtime.combat.v1`, with the authority deriving
  standalone versus dungeon-backed ownership and producing the same two- or
  three-axis stamp shape.

The UNN-678 watchpoint changed the shared command lifecycle as part of this
cutover: pre-receipt `screen` retains only immutable projection context,
transactional `admit` reloads authorization and evidence on every attempt, and
`finalizeAccepted` cannot receive attempt evidence and must be repeat-safe.

#### Tests: **−1,877 net app code lines**

The TypeScript diff outside production is 511 added and 2,388 removed. Deleted
tests asserted client tokens, stale retries, nested queues, and each legacy
action door. Replacements cover intent-only payloads, sequential prediction,
two- and three-axis stamps, final chained encounter revisions, attempt-local
authorization, dungeon-first locking, second-row contention without partial
stamps, and repeatable-read canon vectors. The generic screening/admission/
duplicate-projection lifecycle remains in package contracts.

### The gate: passed

The dungeon route has no expected revision on the wire and no second optimistic
store around the predicted root. Every actual row increment is stamped; the
dungeon row is only locked when encounter start uses it as a lifecycle guard,
so no synthetic bump survives. Watch-only roots and the remaining generic combat
event synchronization runtime stay deliberately assigned to P3c.

---

## Phase 3c — observe-only watch roots (UNN-680)

### Measured: **−1,150 net production code lines in `apps/web`**

`cloc --diff` at the ticket branch point reports 644 added and 1,794 removed
production TypeScript/JavaScript code lines. The cutover:

- replaces the encounter/dungeon snapshot subscription runtime, revision-ping
  parsers, realtime channel hook, composite-version helpers, and refresh
  schedulers with two thin `createNextObservedRoot` bindings;
- moves every generic combat event into `showtime.combat.v1`, deleting the
  parallel Server Action schemas, version queues, and transitional
  `useOptimistic` reducer;
- deletes legacy short-id ping publication and authorization, leaving Ably with
  one hashed-axis capability shape and the package-owned polling fallback;
- removes `apps/web/lib/sync` entirely. The stage-only autosave queue now lives
  with the stage feature, and the generic Server Action rejection guard lives
  under `lib/actions`; neither is synchronization infrastructure for watched
  state; and
- makes watch canons snapshot-consistent and complete over encounter, dungeon,
  map-instance, and projected entity axes. Encounter and map-instance rows are
  the stable container axes for roster membership and live-fight absence.

#### Tests: **−1,845 net app code lines**

`cloc --diff` reports 622 added and 2,467 removed test code lines. Deleted tests
asserted app-owned queues, pings, revision comparisons, abort controllers, and
poll timers. App tests now cover combat intent prediction and stamp shapes,
repeatable-read canon vectors including empty dynamic sets, axis-only token
authorization, and one signed-out Playwright story for structural redaction,
polling catch-up, and explore/combat phase changes.

### The gate: passed

`apps/web/lib/sync` is gone. No combat or watch component compares realtime
revisions, schedules a synchronization refresh, or wraps a Headcanon root in a
second optimistic container. Observe-only roots receive server-redacted canons;
the package owns subscription, polling, refresh coalescing, and freshness.

---

## P3b follow-up — mutation-command ergonomics (UNN-686)

The package production surface adds **22 net lines** (32 added, 10 removed): the
causal-chain-aware PostgreSQL matcher, raw-number stamp interface, and the
explicit repeat-safe finalization contract. Package tests add **43 net lines**
(91 added, 48 removed), principally the accumulator and error-matcher contracts.

Application production contracts by **84 net lines** (80 added, 164 removed):
commands pass persisted numeric revisions directly to the accumulator, the
dungeon-specific error recursion is deleted, and entity, combat, and dungeon
apply their shared actor and executor types through adopter-local command
aliases. Application tests contract by **10 net lines** (7 added, 17 removed).
Documentation lines are excluded from these counts.

The proposed package factory was evaluated and rejected. Its curried identity
calls preserved exact object types but made command declarations less direct.
Local aliases achieve the useful half of the idea: repeated actor, preflight
executor, and transaction arguments fall from 18 type arguments at six
definitions to 9 at three adopter-local aliases. Mutation, projection, and
attempt evidence remain explicit per command, while `screen`, `admit`, `execute`,
and `finalizeAccepted` remain one ordinary object checked with `satisfies`.

### The gate: passed

The application shrinks while the package takes ownership of reusable parsing
and type decisions. Duplicate accepted delivery still reruns finalization, and
the finalization context still excludes attempt-local evidence.

---

## Phase 4 — Stage authoring roots (UNN-692)

### Measured: **+602 net production code lines in `apps/web`**

`cloc --diff` at the ticket branch point reports 873 added and 271 removed
production TypeScript/JavaScript code lines. The net number is growth, but it is
not a queue moved behind a different name:

- deleted the Stage write queue, queued-write hook, monotonic-version ref, both
  version-bearing replacement actions and schemas, and all client-owned stale
  recovery;
- added complete Map and Template Set canons, serializable intent protocols,
  deterministic reducers, and thin predicted-root bindings;
- added the two aggregates' server-authoritative commands: each attempt reloads
  ownership and current state, reduces intent, guards the observed row version,
  and stamps its dedicated axis; and
- retained application-owned editor policy: responsive drafts, debounce/batch
  timing, save status, failure UX, unmount flushing, and canvas reconciliation
  that replays a still-debounced local batch over incoming canon.

The added production code is principally domain capability: 414 lines for the
two intent/canon models and 279 for their command authorities. The deleted
generic coordination includes 112 lines of queue/version helpers and 82 lines
of client-version replacement actions and schemas. The remaining diff is the
editor lifecycle integration and executor-neutral Store wiring.

#### Tests: **+45 net app code lines**

`cloc --diff` reports 700 added and 655 removed test code lines. The deleted
tests asserted queue serialization, monotonic token adoption, and legacy action
stale behavior. Replacements cover event-batch prediction, disjoint composition,
same-target authority order, caller-ID collision refusal, attempt-local auth,
current-row reduction, contention retry, stamps, intent-only wire envelopes,
debounce/blur/unmount behavior, accepted-canon handoff, and actionable uncertain
delivery. Generic ordering, receipts, retries, and canonization remain package
contracts.

### The gate: passed, with domain growth recorded

No second optimistic store or application delivery queue surrounds either
predicted root. Stage sends neither client revisions nor replacement geometry or
content blobs; the application no longer decides ordering, receipt identity,
contention retry, canonization, or invalidation. The positive LOC delta is the
cost of introducing two explicit domain intent vocabularies and authorities,
not preserving the coordination this phase set out to delete.

---

## Running total

| Phase                                      |              Net production lines in `apps/web` | Gate         |
| ------------------------------------------ | ----------------------------------------------: | ------------ |
| P2 — character route (UNN-676)             |    +38 (coordination −297, new capability +261) | passed       |
| P2f — finalize command (UNN-677)           |                                             +64 | prompted P2g |
| P2g — mutation registration seam (UNN-685) | −57 (coordination −316, domain capability +259) | passed       |
| P3a — combat (UNN-678)                     |                                            −227 | passed       |
| P3b — dungeon / multi-row (UNN-679)        |                                            −466 | passed       |
| P3b ergonomics (UNN-686)                   |                                             −84 | passed       |
| P3c — watch-only (UNN-680)                 |                                          −1,150 | passed       |
| P4 — Stage authoring roots (UNN-692)       |                                            +602 | passed       |

End-of-Phase-3 target: ≈ −1,100 to −1,800. Reaching it depends on Phase 3
deleting the transitional bridges and the `lib/sync` runtime, which is where the
remaining coordination actually lives.

Running total through P3c: **−1,882 production code lines in `apps/web`** (+38
+64 −57 −227 −466 −84 −1,150). The character adoption first paid for shared
realtime capability; combat, dungeon, and watch reuse it and convert that
investment into net application contraction.

Running total through P4: **−1,280 production code lines in `apps/web`**. Stage
adds two new domain command surfaces while deleting the last client-version
autosave queue; the total remains inside the original end-of-Phase-3 contraction
range.
