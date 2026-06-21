# ADR: Unified Client Write API (UNN-374 + UNN-482)

Status: **Proposed (revised after adversarial review)** · 2026-06-21 · Consolidates
the client write mechanisms catalogued in
[frontend-write-strategies.md](frontend-write-strategies.md).

> **Revision note.** The first draft proposed (a) *replacing* `useOptimistic` with a
> hand-rolled version-anchored accumulator and (b) *full-adopting* the character path
> onto it in one move. Five grounded adversarial reviews (summarized in §Adversarial
> review) found the accumulator-as-specified reintroduces the very bug it targets and
> rests on a factual misread of `useOptimistic`. This revision keeps the two sound
> layers (`VersionTokenStore`, `useQueuedWrite + onIdle`), **wraps** `useOptimistic`
> instead of replacing it, and **stages** the rollout so the big-bang never lands on
> the busiest surface. The two reversed decisions are called out in §Decision.

## Context

The frontend has ~nine distinct mechanisms for triggering a backend write (see the
companion survey). They fall into two parallel substrates solving the same problem
differently:

| | Character path | Live-session path |
|---|---|---|
| Token | 4× `useCharacterTokenRef` + `mergePingedVersions` + console `pcVitalsVersions` map | `useQueuedWrite`'s monotonic ref |
| Queue | **none** — relies on stale-retry for back-to-back | serialized `enqueue` (UNN-378) |
| Optimism | shared `useOptimistic` + `reduceCharacter` | dual `useOptimistic` containers |
| Reconcile | per-write `revalidatePath` (rides the action response) + belt-and-suspenders `router.refresh()` | per-write `router.refresh()` |
| Disables control on pending? | yes | yes |

Two backlog tickets target the two layers of this divergence:

- **UNN-374** — the "latest-known per-class version token" concept lives in ~six shapes
  re-implementing the same invariants (monotonic, forward-only, bump-on-success,
  prop-sync absorbs server values). Give it a type.
- **UNN-482** — stop disabling *edit* controls; make rapid edits spam-safe with the
  displayed value accumulating across a burst and reconciling cleanly (ideally one
  end-of-burst refresh). Keep *creation* and *destructive/lifecycle* actions gated.

The divergence is **mostly principled** (the survey's own conclusion): it tracks *who
writes*, *trust boundary*, and *how rare/destructive* a write is. The genuinely
*unprincipled* duplication is narrow — the token plumbing (UNN-374) and
`use-map-autosave` duplicating the character-autosave core (UNN-483/-274). This ADR
consolidates the narrow duplication and adds the spam-safe-stepper UX where it's needed;
it does **not** force all nine surfaces under one hook.

## Decision

Three layers on a shared token type, rolled out in stages. Two decisions were
**reversed** from the first draft on the strength of the adversarial findings:

1. **WRAP `useOptimistic`, do not replace it.** *(Reversed.)* `useOptimistic` already
   stacks all pending edits over a base and reverts when the passthrough updates — the
   exact mechanism the accumulator tried to rebuild, but tear-free and battle-tested.
   The burst problem is solved by **holding the burst's transitions open until one
   shared reconcile lands**, not by re-implementing optimistic replay in userland.
2. **Stage the character path; keep `dispatchCharacterWriteWithRetry` until proven.**
   *(Reversed from "full-adopt now.")* Prove the wrap on the live-session steppers
   (already queued, where the burst need is real), then migrate the character path
   **per-class, behind a flag, vitals-steppers first.**
3. Write/maintain this ADR before code (unchanged).

### Layer 1 — `VersionTokenStore` (UNN-374, behavior-neutral) — **ship first**

The existing ref semantics given a name. Per entity, keyed by version class.

```ts
interface VersionTokenStore<Class extends string> {
  read(cls: Class): number
  bump(cls: Class, version: number): void                    // forward-only, monotonic
  forward(pinged: Partial<Record<Class, number>>): boolean   // absorb ping/broadcast → "fresher?"
  ref(cls: Class): RefObject<number>                         // legacy bridge (see below)
  // snapshot(): Record<Class, number>                       // Layer 3 — deferred (see below)
}

function createVersionTokenStore<Class extends string>(                 // pure, React-free
  initial: Record<Class, number>,
): VersionTokenStore<Class>

function useVersionTokenStore<Class extends string>(
  serverVersions: Record<Class, number>,                     // prop-synced, forward-only
): VersionTokenStore<Class>

// The open-key sibling façade (see the cardinality note below). Same forward-only
// monotonic core; a different surface because the keyspace is dynamic.
interface MonotonicVersionMap<K> {
  read(key: K): number | undefined                           // undefined ⇒ never seen
  bump(key: K, version: number): void                        // forward-only; creates if unseen
  ref(key: K, seed: number): RefObject<number>               // bridge; getter falls back to seed
}
function useMonotonicVersionMap<K>(): MonotonicVersionMap<K>
```

**Subsumes (precisely):** the four `useCharacterTokenRef` refs, their forward-only
prop-sync, `mergePingedVersions`' forward-on-ping (→ `forward`), the dispatch's
*bump-on-success* (→ the monotonic setter behind `ref`/`bump`), and the console's
`pcVitalsVersions` map (→ `MonotonicVersionMap<pcId>` — see the cardinality note).

**Three adjustments made during the UNN-374 implementation:**
- **`snapshot()` is deferred to Layer 3, not shipped in this PR.** Its only consumers
  are the cross-class level-up/rest payloads, which the migration table routes through
  `useGatedAction` in Layer 3 — so shipping the method in Layer 1 would add interface
  surface with zero callers (CLAUDE.md #4, "resist premature abstraction"). The type is
  declared here as the north star; the implementation adds the method when its consumer
  lands (with the must-not-change-level-up/rest-semantics guard test below). `read` /
  `bump` / `forward` / `ref` all have real Layer-1 consumers.
- **`ref(cls): RefObject<number>` is the legacy bridge** the `dispatchCharacterWriteWithRetry`
  / `useDebouncedAutoSave` consumers need (their signatures still take a raw
  `RefObject<number>` and are frozen in Layer 1). The adapter closes over the store —
  getter is `read`, setter is the forward-only `bump` — so it is a view, not a snapshot.
  Layer 2/3 retire it as those consumers move to `(tokens, class)` directly.
- **The console gets `MonotonicVersionMap<pcId>`, not `Map<pcId, VersionTokenStore>`.**
  The draft's parenthetical prescription was the wrong cardinality. `VersionTokenStore`
  is a **closed**-key façade (a fixed set of classes, all present from birth; its
  `forward` deliberately *skips unknown keys*). The console is the **opposite** shape: an
  **open**, dynamic set of *entities* (PCs come and go) each tracking *one* token, where
  the class dimension is degenerate (`"vitals"`) and "skip unknown keys" is actively wrong
  (a foreign-PC ping should *create*, not be silently dropped). Wrapping the closed store
  in a `Map` reproduced the read with awkward seed-on-create scaffolding and carried that
  latent footgun. The fix is a **shared monotonic-forward core (`bumpToken` over a `Map`)
  with two façades** keyed by cardinality: `VersionTokenStore<Class>` (closed; adds the
  ping-shaped `forward`) and `MonotonicVersionMap<K>` (open; `read`/`bump`/`ref`, no
  `forward`/class dimension). Both have real consumers today; zero duplicated invariant
  logic. There are now three primitives by cardinality — `useMonotonicVersionRef` (1
  token × 1 entity), `VersionTokenStore` (N fixed classes × 1 entity),
  `MonotonicVersionMap` (1 class × N dynamic entities) — which is more coherent than
  stretching the N×1 store over the 1×N case. (The console's per-PC token also has a
  Layer-2/3 trajectory: its *write*-coordination half folds into a per-PC burst-write,
  but its *ping-compare* half — console-level, spanning all PCs — survives as exactly this
  `MonotonicVersionMap`, so the primitive is durable, not transient.)

**Does NOT subsume — do not over-claim** (adversarial finding):
- **The UNN-274 per-class *save-queue serialization*** is a separate concern (a
  `Promise` chain ordering debounced saves), *not* token state. It stays where it is in
  this PR; it folds into Layer 3's `useAutoSaveField` later, not here.
- **The stale-retry** half of `dispatchCharacterWriteWithRetry` is dispatch behavior
  (Layer 2), not token state.
- **`snapshot()` must not change level-up/rest semantics.** Those dialogs read versions
  straight off props today and deliberately opt out of stale-retry. Routing them through
  `snapshot()` must return the same value the prop carries, or it's a behavior change —
  not behavior-neutral. Guard this with a test.

Everything else in Layer 1 is behavior-neutral, regression-testable against current
behavior, and shippable alone. This is the safe first PR.

### Layer 2 — `useQueuedWrite`, extended — **ship with Layer 3**

Keep the UNN-378 hook (`apps/web/hooks/use-queued-write.ts`); two edits:
- Back its version ref with a `VersionTokenStore` lane so it and the realtime ping
  compare share one token (closes UNN-374 item-6 threading).
- **Add `onIdle`** — fired when the serialized queue chain *fully drains* (chained off
  the last settled promise, **never** a debounce timer — see reconcile hazard below).

### Layer 3 — `useBurstWrites` (UNN-482) — wraps `useOptimistic`

The reviews established the correct, minimal shape:

- **Keep `useOptimistic` + the engine reducer** as the optimistic projection (unchanged
  from today). Each `mutate(edit)` calls `addOptimistic(edit)` and enqueues the dispatch
  through Layer 2.
- **Hold the burst open.** Today each write opens its own transition that stays pending
  until *its* truth lands (so the overlay survives). Preserve that property across a
  burst: the burst's transitions remain pending until **one** shared reconcile lands at
  `onIdle`. That keeps every edit's optimistic contribution mounted for the whole burst —
  no mid-burst undercount — while collapsing N refreshes to one.
- **Reconcile drives off the server's *returned* version, never a predicted stamp.**
  `tokens.bump(class, result.value.version)` consumes the value the action returns
  (which may be +1, +2, or a multi-lane pair). No client-side version arithmetic.
- **Controls stop disabling on pending** for *edit* surfaces only; `mutate` returns
  synchronously.

```ts
const { value, mutate, isFlushing } = useBurstWrites({
  base,                       // server-hydrated entity (passthrough to useOptimistic)
  reduce,                     // pure (state, edit) => state — the engine reducer
  tokens,                     // VersionTokenStore (Layer 1)
  enqueue,                    // from useQueuedWrite (Layer 2)
  classesOf: (edit) => Class[],        // lanes this edit's action advances (≥1)
  applyResult: (tokens, result) => void, // bump each returned lane from server truth
  onError?: (edit, error) => boolean,    // return true to suppress toast (preserved)
  realtime?,                  // ping + BroadcastChannel (TAB_ID echo-suppressed)
})
```

Why this satisfies UNN-482 where the accumulator didn't:

| Failure the accumulator hit | Why the wrap avoids it |
|---|---|
| Prune keys off token, not base → undercount | No pruning; `useOptimistic` reverts on passthrough commit, atomically |
| Predicted stamp ≠ server version (cross-class, batch, +2, multi-lane) | No prediction; bump from the returned version(s) via `applyResult` |
| `useRef` won't render / `useState` tears | `useOptimistic` is the store; tear-free by design |
| Ping `forward` GC's a live edit | `forward` only suppresses redundant refreshes; it never gates the overlay |
| Mid-burst hard-fail corrupts later edits | React reverts the failed edit's overlay; survivors replay over the new base |

**Reconcile hazard (must-hold invariant).** `onIdle`'s single reconcile MUST be chained
behind the queue's last settled promise so the read observes the last commit. If the
actions keep their per-write `revalidatePath` (recommended), the base already advances
per action-response and `onIdle` is a cheap final consistency pass; if they drop it for a
sole end-of-burst `router.refresh()`, that refresh re-runs the whole route RSC tree and
must be proven read-after-write consistent. Do **not** schedule `onIdle` off a debounce
timer — a refresh that fires before the last DB commit strands the last edit as a
permanent optimistic ghost.

### Adapter A — `useAutoSaveField`

Debounced text/markdown/whole-blob fields. Fires `mutate` on debounce-idle/blur/unmount
with a **single replace edit** (last-value-wins), and absorbs the UNN-274 per-class save
queue. The map editor is `useAutoSaveField` over the `geometry` lane — **but** keeps its
own *no-hard-revert-on-failure* policy (discarding canvas work on a blip is worse than
keeping it) and its independent name/geometry debounce timers. These are real per-field
escape hatches, not accumulator config; the adapter must expose them.

### Adapter B — `useGatedAction` (the deliberate exception)

Creation + destructive/lifecycle actions disable during flight. `{ confirm?, onSuccess?,
onError? }` (the `onError` is needed for the rest/level-up domain-error toasts).
**Exception:** the zero-JS `<form action>` join flow stays a Server Component — it is
*not* migrated, because a client hook would regress its works-without-hydration property.

### Carve-outs (writes that do NOT fit the optimistic model)

- **Portrait upload** has no client-known optimistic value (the Blob URL is server-only).
  It stays a gated, `disabled={pending}` write — there is nothing to project.
- **Builder field writes** have no central reducer (each leaf owns its optimism). They
  keep their bespoke `optimistic()` callback rather than a forced null-reduce.

## Surface migration (corrected)

| Survey mechanism | Becomes |
|---|---|
| #6 live-session dual-container dispatch (encounter/dungeon steppers) | **`useBurstWrites`** — *prove it here first* |
| #1 character optimistic click-dispatch | `useBurstWrites` — *staged, per-class, flagged, after #6* |
| #2 character debounced autosave | `useAutoSaveField` (folds UNN-274 queue) |
| #7 whole-blob map autosave | `useAutoSaveField` w/ no-revert + dual-timer escape hatches; consumes `VersionTokenStore` (closes UNN-483) |
| #3 cross-class dialogs (level-up/rest) | `useGatedAction` w/ `snapshot()` — *and a test that it submits today's version* |
| #4 command palette | delegates to `mutate`; must preserve the submit→close completion signal |
| #8 ping → refresh | `VersionTokenStore.forward` + scheduled refresh (TAB_ID echo-suppressed) |
| #5 builder steps, #9 CRUD, staging commits, Start/End combat | `useGatedAction` |
| #9 zero-JS join `<form action>` | **unchanged** — stays a Server Component |
| Portrait upload | **unchanged** — gated, no optimistic projection |

Not "nine → two." Honestly: a shared token type + one burst-write wrap + two adapters,
**plus** named carve-outs the single hook deliberately does not absorb.

## Sequencing & risk

1. **UNN-374 `VersionTokenStore`** — behavior-neutral, ship alone. Dissolves
   `mergePingedVersions`, the four token refs, and the console map. Zero UX risk.
2. **`onIdle` + `useBurstWrites` on live-session steppers only** (encounter + dungeon,
   already queued). Prove the wrap + the AC burst test where the burst need is real,
   without touching the character path.
3. **Character path, staged** — per-class behind a flag, vitals-steppers first, *after*
   step 2 is proven. Retire `dispatchCharacterWriteWithRetry` only when the last class
   migrates. A regression rolls back one class, not the sheet.
4. **Map** — close UNN-483 by having `use-map-autosave` consume `VersionTokenStore`; do
   **not** fold whole-blob-replace into the accumulate-and-replay model.

## The required test (UNN-482 AC)

The hardest AC — *rapid dispatch lands the correct cumulative result with no
stale-rejection toast and no transient undercount* — must drive `base` independently of
the tokens (simulate the refresh lagging the dispatches) and cover the three cases the
naive design failed: (a) out-of-order resolution, (b) a mid-burst third-party
ping/broadcast, (c) a mid-chain hard-fail. `use-queued-write.test.ts`'s controlled-action
+ microtask-drain pattern is the starting point; it must be extended to assert the
**displayed** `value`, not just version advancement.

## Must-not-drop requirements (adversarial findings)

- **A11y:** removing `disabled={pending}` deletes the only screen-reader signal of
  in-flight state. The projected value MUST be wrapped in `aria-live="polite"` and
  `aria-busy` driven by `isFlushing`. Non-negotiable, not an afterthought.
- **Per-class `isFlushing`:** a single aggregate boolean can't express "HP saving,
  Victories idle" — the current two-`useTransition` independence in `HeaderOwnerActions`.
  Expose `isFlushing(class)`.
- **TAB_ID echo suppression** (UNN-203) and the **one-shot stale-retry budget** must
  survive into the wrap; the burst must not multiply the retry budget by N.
- **Differentiated error copy** (`poolErrorMessage`, rest/level-up domain errors) must
  survive per surface via `onError`.

## Consequences

**Positive.** One token type; spam-safe steppers where they're needed; UNN-274/483 debt
paid; `useOptimistic` (proven) retained; reconcile collapses to one per burst; the
realtime/broadcast funnel gets one owner. Edit-vs-create is a call-site choice.

**Costs / risks.** Even staged, the character migration touches the busiest surface — but
per-class + flag + reversible makes a regression cheap. `useBurstWrites` adds coupling at
the queue/token layer; contained because it wraps (not replaces) the React primitive.
The map's whole-blob semantics and the join form's zero-JS property are deliberately left
outside the unification rather than forced in.

**Out of scope / unchanged.** Server-side strategies
([server-write-strategies.md](server-write-strategies.md)) are untouched. The dungeon
instance-version refetch gap (UNN-468) is orthogonal but would slot into the shared-token
wiring `useBurstWrites` establishes.

## Adversarial review (2026-06-21)

Five Opus reviews, each grounded in the real code, pressure-tested the first draft:

1. **Accumulator correctness** — the prune predicate keys off `tokens.read`, which
   advances on dispatch success, while `base` advances only on refresh; in the gap the
   edit is pruned before `base` reflects it → the transient undercount UNN-482 targets.
   "By construction" was false as specified.
2. **Version stamping** — client-predicted `base + pendingInClass` ≠ server-assigned
   versions under cross-class writes (level-up +1/+1), batched bumps ("clear" = one
   bump), +2 lifecycle (`startCombat`), and two-lane writes (`addCombatant`/`searchReveal`
   return/advance two versions). Predicted stamps strand or double-count edits.
3. **React/Next feasibility** — the premise "`useOptimistic` only replays its own
   transition" is wrong (it stacks all pending edits, reverts on passthrough). A `useRef`
   accumulator won't render; a `useState` one reintroduces the tearing `useOptimistic`
   prevents. `router.refresh()` vs `revalidatePath` conflation risks a permanent
   optimistic ghost. Verdict: **wrap, don't replace.**
4. **Scope/blast radius** — the "maturity spends the premature-abstraction caution"
   premise inverts CLAUDE.md #4 (coupling is paid continuously); map whole-blob and the
   zero-JS join don't fit; "ship 374 first" de-risks the *safe* part, not the full-adopt.
   Verdict: stage it, prove the wrap on live-session steppers first.
5. **AC/spec conformance** — `VersionTokenStore` doesn't subsume the save-queue
   serialization or the retry; `snapshot()` would change level-up's submitted version;
   a11y, per-class flushing, TAB_ID, retry budget, and error copy were dropped.

This revision incorporates all five. The accumulator-replacement is withdrawn; the wrap
+ staged rollout + must-not-drop requirements above are the result.
