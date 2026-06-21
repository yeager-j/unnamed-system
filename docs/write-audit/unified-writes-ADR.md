# ADR: Unified Client Write API (UNN-374 + UNN-482)

Status: **Proposed** · 2026-06-21 · Supersedes the nine ad-hoc client write
mechanisms catalogued in [frontend-write-strategies.md](frontend-write-strategies.md).

## Context

The frontend has matured to ~nine distinct mechanisms for triggering a backend
write (see the companion survey). They fall into two parallel substrates that solve
the same problem differently:

| | Character path | Live-session path |
|---|---|---|
| Token | 4× `useCharacterTokenRef` + `mergePingedVersions` + console `pcVitalsVersions` map | `useQueuedWrite`'s monotonic ref |
| Queue | **none** — relies on stale-retry for back-to-back | serialized `enqueue` (UNN-378) |
| Optimism | shared `useOptimistic` + `reduceCharacter` | dual `useOptimistic` containers |
| Reconcile | per-write `revalidate` / `router.refresh()` | per-write `router.refresh()` |
| Disables control on pending? | yes | yes |

Two backlog tickets target the two layers of this divergence:

- **UNN-374** — the "latest-known per-class version token" concept lives in ~six
  shapes, each re-implementing the same unstated invariants (monotonic, forward-only,
  bump-on-success, prop-sync absorbs server values). Give it a type. Explicitly
  behavior-neutral.
- **UNN-482** — stop disabling *edit* controls; make rapid edits spam-safe with the
  displayed value accumulating across a burst and reconciling cleanly (one
  end-of-burst refresh). Keep *creation* and *destructive/lifecycle* actions gated.
  The heart of the ticket is rethinking the per-transition optimistic-revert model.

Neither is cleanly doable alone: 482's accumulator needs a single authoritative token
owner (374), and 374's payoff is only realized once one hook consumes it everywhere
(482). The frontend is mature and few new surfaces are expected post-dungeons, so the
"premature abstraction" caution is now spent — this is the right moment to consolidate.

## Decision

Collapse the nine mechanisms to **two primitives + two adapters**, layered on a single
token type. Three confirmed design decisions:

1. **Full adopt** — the character click-write path migrates onto the shared queue, so
   there is one dispatch substrate everywhere. `dispatchCharacterWriteWithRetry` is
   retired.
2. **Replace `useOptimistic`** with a version-anchored optimistic accumulator (below).
3. Write this ADR before any code.

### Layer 1 — `VersionTokenStore` (UNN-374, behavior-neutral)

The existing ref semantics given a name. Per entity, keyed by version class.

```ts
interface VersionTokenStore<Class extends string> {
  read(cls: Class): number
  bump(cls: Class, version: number): void                    // forward-only, monotonic
  forward(pinged: Partial<Record<Class, number>>): boolean   // absorb ping/broadcast → "fresher?"
  snapshot(): Record<Class, number>                          // multi-class action payloads (level-up)
}

function useVersionTokenStore<Class extends string>(
  serverVersions: Record<Class, number>,                     // prop-synced, forward-only
): VersionTokenStore<Class>
```

Class is `"identity" | "vitals" | "inventory" | "progression"` for characters; a single
`"session"` (encounter) / `"dungeon"` + `"instance"` (delve) / `"geometry"` (map)
elsewhere. Monotonicity lives in exactly one place.

**Replaces:** the four `useCharacterTokenRef` refs, the prop-sync effect, the UNN-274
per-class save-queue version coordination, `dispatchCharacterWriteWithRetry`'s
mutate-on-success, `mergePingedVersions`' forward-on-ping, and the console's
`pcVitalsVersions` map (→ `Map<pcId, VersionTokenStore>` or a `pcId:class`-keyed lane).
**Zero behavior change** — shippable and fully testable against current behavior on its
own. This is the safe first PR and de-risks everything after it.

### Layer 2 — `useQueuedWrite`, lightly extended

Keep the UNN-378 hook (`apps/web/hooks/use-queued-write.ts`); two edits:

- Swap its internal `useMonotonicVersionRef` for a `VersionTokenStore` lane, so it and
  the realtime ping compare share one token (closes the UNN-374 item-6 threading that
  forced the console lift-and-thread refactor).
- **Re-introduce `onIdle`** — fired when the serialized queue chain drains. UNN-378
  deliberately removed it because the end-of-burst reconcile only pays off once controls
  stop disabling, and doing it correctly needs the accumulator below. That precondition
  is now this work.

### Layer 3 — `useBackgroundWrites` (UNN-482, the headline)

**The core problem.** React's `useOptimistic` only replays an optimistic edit while
*its* transition is pending. With per-write `router.refresh()`, each transition stays
pending until its own truth lands — correct, but a burst of N clicks fires N refreshes.
Naively deferring the refresh to end-of-burst makes a mid-burst stepper transiently show
the **wrong total**, because earlier events drop out of `useOptimistic` before the
batched refresh rebases the base. You cannot fix this while optimism is tied to
transition lifecycle.

**The model.** Anchor optimism to *versions*, not transitions:

> Optimistic state = the server base reduced by the edits whose version is **ahead of
> the base**.

Each edit is version-stamped when enqueued. The displayed value is a pure projection.
An edit only leaves the accumulator once the server base prop has caught up *past* its
version. This is self-cleaning, monotonic, flicker-free, and undercount-free **by
construction**, and it generalizes both the character `useOptimistic` and the
dual-container approach into one mechanism.

```ts
const { value, mutate, isFlushing } = useBackgroundWrites({
  base,                       // server-hydrated entity (HydratedCharacter | CombatSession | DungeonState | Geometry)
  tokens,                     // VersionTokenStore from layer 1
  reduce,                     // pure (state, edit) => state — the engine reducer
  dispatch,                   // (edit, expectedVersion) => Promise<Result<{ version }, WriteError>>
  classOf,                    // (edit) => Class — which token lane this edit advances
  onSettled,                  // default: one router.refresh() at end-of-burst
  realtime,                   // channel + broadcast wiring (folds in Ably + BroadcastChannel)
})
```

Semantics:

- `value = reduce(base, pending.filter(e => e.version > tokens.read(classOf(e))))`.
  Always reflects every click.
- `mutate(edit)` — stamp `version = tokens.read(class) + pendingInClass`, push to the
  accumulator, `enqueue` the dispatch. **Returns synchronously; never disables a
  control.**
- success → `tokens.bump`; the edit stays in the accumulator until the base catches up.
- `stale` → existing one-shot refetch + retry (free — it's inside `enqueue`).
- hard fail → drop that one edit (revert it specifically) + toast; later edits in the
  burst are unaffected.
- queue drains → `onSettled()` **once** (the single end-of-burst refresh).
- ping / broadcast → `tokens.forward(...)`; if fresher, schedule the same refresh.

Multi-class (characters): the `reduce` is whole-entity; version anchoring is per class.
An edit's stamp and its pruning both key off `classOf(edit)`, so a vitals burst and an
identity autosave accumulate independently and prune independently. Single-class entities
(encounter/dungeon/map) are the degenerate one-lane case.

This is the one hook the steppers, toggles, cast, mechanics, inventory, and the
encounter/dungeon event dispatch all call.

### Adapter A — `useAutoSaveField`

Debounced text/markdown fields are `useBackgroundWrites` where `mutate` fires on
debounce-idle / blur / unmount instead of per-click. Same accumulator, same token store
— so UNN-274's per-class save queue dissolves into Layer 3, and the map editor's
whole-blob autosave (`use-map-autosave.ts`) becomes a `geometry`-lane instance of it.

### Adapter B — `useGatedAction` (the deliberate 482 exception)

Creation and destructive/lifecycle actions must **not** background — a double-submit
duplicates a row or fires a lifecycle transition twice. Name the existing CRUD pattern so
it is the obvious, lint-able choice:

```ts
const { run, isPending } = useGatedAction(action, { confirm?, onSuccess })  // disables during flight
```

The two hooks make the **edit-vs-create distinction a type-level choice at the call
site** — today it is an undocumented judgment call, which is the real DX win.

## Surface migration

| Survey mechanism | Becomes |
|---|---|
| #1 optimistic click-dispatch, #6 dual-container event dispatch | **`useBackgroundWrites`** (one hook, two configs) |
| #2 debounced autosave, #7 whole-blob map autosave | **`useAutoSaveField`** over `useBackgroundWrites` |
| #3 cross-class dialogs (level-up / rest) | `useBackgroundWrites` w/ multi-class `tokens.snapshot()` payload — the seam that motivated the store |
| #4 command palette | unchanged — delegates to `mutate` instead of `useCharacterWrite` |
| #8 ping → refresh | folds into the `realtime` option / `tokens.forward` |
| #5 builder step-writes, #9 CRUD, staging-rail commits, Start/End combat | **`useGatedAction`** |

Nine → two primitives + two adapters.

## Sequencing & risk

1. **UNN-374 first** — introduce `VersionTokenStore`; migrate the character refs, the
   console `pcVitalsVersions` map, and `mergePingedVersions` onto it. Pure refactor, no
   UX change, regression-testable against current behavior. De-risks the rest.
2. **UNN-482 second** — add `onIdle` to `useQueuedWrite`; build `useBackgroundWrites`
   with the version-anchored accumulator; migrate the encounter steppers first (already
   queued), then full-adopt the character path, then drop `disabled={pending}` on edit
   controls. The accumulator is the one genuinely novel piece and where the ticket's AC
   test — *rapid repeated dispatch lands the correct cumulative result with no
   stale-rejection toast and no transient undercount* — earns its keep.

## Consequences

**Positive.** One dispatch substrate; one token type; edit-vs-create is a call-site type
choice; spam-safe steppers with a single end-of-burst refresh; the realtime/broadcast
funnel has one owner; UNN-274's save-queue and the console threading dissolve.

**Costs / risks.** The accumulator is custom code replacing a React primitive — it
carries the burst-correctness invariants and needs thorough tests. Full-adopt touches the
most-used path (character sheet), the highest regression surface — mitigated by shipping
374 behavior-neutral first. The map editor's whole-blob save (not event-delta) must map
onto the accumulator as a single "replace geometry" edit per debounce, not per keystroke.

**Out of scope / unchanged.** Server-side strategies (see
[server-write-strategies.md](server-write-strategies.md)) are untouched — this is purely
the client trigger layer. The dungeon console's missing instance-version refetch
(deferred to UNN-468) is orthogonal but would slot cleanly into the `realtime`/refetch
wiring here.
