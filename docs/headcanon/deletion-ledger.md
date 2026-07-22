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

## Running total

| Phase                                      |              Net production lines in `apps/web` | Gate         |
| ------------------------------------------ | ----------------------------------------------: | ------------ |
| P2 — character route (UNN-676)             |    +38 (coordination −297, new capability +261) | passed       |
| P2f — finalize command (UNN-677)           |                                             +64 | prompted P2g |
| P2g — mutation registration seam (UNN-685) | −57 (coordination −316, domain capability +259) | passed       |
| P3a — combat (UNN-678)                     |                                            −227 | passed       |
| P3b — dungeon / multi-row                  |                                               — | —            |
| P3c — watch-only                           |                                               — | —            |

End-of-Phase-3 target: ≈ −1,100 to −1,800. Reaching it depends on Phase 3
deleting the transitional bridges and the `lib/sync` runtime, which is where the
remaining coordination actually lives.

Running total through P3a: **−182 production code lines in `apps/web`**
(+38 +64 −57 −227). The character adoption first paid for shared realtime
capability; the combat adoption reuses it and converts that investment into net
application contraction.
