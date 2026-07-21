# Headcanon deletion ledger

**Purpose:** the [technical design](./technical-design.md)'s *application
contraction gate* — "package growth is acceptable; application coordination
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

| Lines | What went |
| ---: | --- |
| −78 | `domain/entity/use-entity-write.tsx` (326 → 248 code; 489 → 373 total) — every queue, version ref, token port, refetch, `enqueue` variant, realtime ping listener, and retry dispatcher |
| −54 | `lib/actions/entity/mutations/apply-identity.ts` — the transitional identity door, with its legacy ping bridge and server-minted mutation IDs |
| −56 | `lib/actions/entity/apply-entity-write.ts` + its schema — the legacy character door |
| −39 | the four identity leaves (name, pronouns, notes, portrait) — they no longer import Server Actions at all, only per-field descriptors |
| −31 | the three planner autosave hooks — the CAS ceremony they were faking (`version: 0`, `action(0)`) |
| −11 | `domain/entity/use-debounced-auto-save.ts` — `dispatchWrite`, the `expectedVersion` parameter, the `"stale"` branch |
| −5 | `lib/actions/entity/entity-mutation.schema.ts` — `entityMutationBase`, orphaned once finalize read its own guard |
| −23 | the remaining call sites: `stale` toast copy, `useEntityIdentityQueue` consumers, builder step, finalize |

#### Capability added: +261

| Lines | What arrived |
| ---: | --- |
| +124 | `lib/realtime/axis-invalidations.ts` — the client axis-invalidation transport (**new liveness**, not a swap) |
| +55 | `domain/entity/use-entity-predictions.ts` — the send adapter + root family |
| +41 | `app/api/realtime/token/route.ts` — axis capability validation + the namespace endpoint |
| +41 | `lib/actions/entity/mutations/apply.ts` — the one door for both mutations, incl. the **transitional** Phase-3a ping bridge |

The −300..−500 estimate priced a like-for-like swap. It did not price (a) wiring
realtime *up* to the new architecture — deleting the ping listener without an
axis subscriber would have regressed cross-tab and DM-writes-to-sheet liveness —
or (b) the two bridges that *partial* adoption forces, both of which Phase 3a
deletes:

- the entity door republishes accepted mutations as legacy `character:{shortId}`
  pings, because combat and the dungeon watch still listen there;
- combat's durable arm now calls `finalizeExternalActionCommit`, which is
  invariant 15 (*every write that advances a protocol axis uses the executor or
  the external-commit finalizer*) being **enforced**, not overhead.

#### Tests: −256 net lines, and the composition changed

| Lines | File |
| ---: | --- |
| −189 | `mutations/apply-identity.test.ts` (door deleted) |
| −166 | `use-debounced-auto-save.test.ts` — version threading, stale refetch, second-stale rollback |
| −118 | `use-entity-write.test.tsx` — queue serialization, class isolation, token forwarding, ping comparison, echo suppression, reconnect |
| +217 | app-semantics and boundary coverage: door bridge/authorization (+89), token-route axis capabilities (+70), RSC-serializability of the mount (+40), external-commit finalization (+15), pre-check return (+3) |

This is the AC's "coordination tests move to package contracts; the app keeps
predictor-refusal, error-mapping, and autosave-semantics tests only." What
remains in `use-entity-write.test.tsx` is predictor refusal, refusal-handler
suppression, wire-envelope shape, lifecycle→toast mapping, the predicted
identity overlay, canonization settling, and autosave settle semantics.

### The gate: passed

The hard requirement was never the number — it was *"if the existing provider
remains intact around or under `mutate`, the spike stops before Phase 3."*
Nothing wraps `mutate` to re-decide delivery, versions, or freshness. Queues,
version refs, stale refetch, realtime comparison, refresh scheduling, and
canonization no longer exist in this binding.

### Deviations from the ticket's ACs

- **No feature flag.** Decided with the user: this is a long-lived epic branch,
  so a revert is the rollback and a flag would have meant keeping the machinery
  the ticket exists to delete. The AC's flag clause and its deletion clause were
  in direct tension; deletion won.
- **`lib/sync/character-version-sync.ts` survives.** The AC expected it deleted,
  but combat (`write-lanes.ts`, `pc-ping.ts`) and the dungeon explore body still
  import it. Only the character provider's use is gone; the module falls in
  Phase 3a. Same for `version-token-store.ts` (combat-only) and the character
  call sites of `use-monotonic-version-ref.ts` / `write-queue.ts` /
  `getEntityClassVersionAction` (all retained by combat/dungeon/stage/encounter).

### Carried forward to Phase 3a

The bridges above, plus: `apps/web/lib/sync` still holds a synchronization
runtime for the un-migrated bindings, and `guard-write-transition` remains
app-owned (finalize, builder step, and portrait upload are outside the protocol
by design).

---

## Running total

| Phase | Net production lines in `apps/web` | Gate |
| --- | ---: | --- |
| P2 — character route (UNN-676) | +38 (coordination −297, new capability +261) | passed |
| P3a — combat | — | — |
| P3b — dungeon / multi-row | — | — |
| P3c — watch-only | — | — |

End-of-Phase-3 target: ≈ −1,100 to −1,800. Reaching it depends on Phase 3
deleting the transitional bridges and the `lib/sync` runtime, which is where the
remaining coordination actually lives.
