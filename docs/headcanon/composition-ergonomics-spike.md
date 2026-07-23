# UNN-688 composition-ergonomics spike

**Ticket:** UNN-688 — Headcanon spike: investigate Auth.js-style composition and API ergonomics
**Date:** 2026-07-22
**Status:** Investigation complete; decisions below await review before any consumer refactor

## Decisions

| #   | Proposal                                            | Decision            | One-line rationale                                                                                                                                                            |
| --- | --------------------------------------------------- | ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `action`-based Next predicted-root golden path      | **Adopt**           | Deletes the sender adapter, the refresh line, and an explicit type argument; −25 % module tokens                                                                              |
| 1b  | `createNextObservedRoot` router-refresh default     | **Adopt**           | Same convention, trivially safe; collapses a two-entry import to one                                                                                                          |
| 2   | `createNextHeadcanonClient` / `...Server` facades   | **Reject**          | Each boundary yields exactly one capability; a facade would be a delegating wrapper around proposal 1                                                                         |
| 3   | Self-identifying commands (`defineMutationCommand`) | **Spike (UNN-691)** | Flat factory deletes nothing (UNN-686 reconfirmed); the scoped definer works (§3b, −8 %) — review moved the call to an in-anger spike with a lint-enforced member order (§3c) |
| 4   | `recovery` sub-object on the predicted-root result  | **Reject**          | `status.pending` is a daily field; grouping renames ~28 accesses across 5 modules and deletes zero                                                                            |
| 5   | Convention-over-configuration at owned seams        | **Narrow**          | Client conventions adopted via #1; server no-realtime mode deferred for lack of a consumer                                                                                    |
| 6   | Auth.js-style golden-path README opening            | **Adopt**           | Draft below, ready to land with #1's promotion                                                                                                                                |

Prototype code on this branch: the `action` overload, `NextMutationAction`,
`createNextObservedRoot`, and `PredictedRootHook` in
`packages/headcanon/src/next/client.ts` / `src/react.ts` (additive, tested);
after-form consumer variants in `apps/web/domain/**/*.spike.ts`. Promotion —
switching the three real consumers and the README — is deliberately **not**
done in this spike.

## Evaluation set and method

Candidates were applied to the ticket's four consumers:

- character route binding ([use-entity-predictions.ts](../../apps/web/domain/entity/use-entity-predictions.ts));
- combat binding ([use-combat-predictions.ts](../../apps/web/domain/combat/use-combat-predictions.ts));
- dungeon multi-axis binding ([use-dungeon-predictions.ts](../../apps/web/domain/dungeon/use-dungeon-predictions.ts));
- observe-only fixture pair (`use-dungeon-watch.{before,after}.spike.ts` — no
  production observed consumer exists yet; watch views still ride legacy pings).

Lexical tokens are TypeScript scanner tokens with trivia (comments, blanks)
excluded, measured on the real modules and their spike twins. Verification:
`tsc --noEmit` in both workspaces, the full Headcanon Vitest suite
(193 passed / 14 skipped), `apps/web` `depcheck` (tier gradient, purity, and
version-write gates), and ESLint on every touched file — all green. The
package's shared-entry dependency gate continues to cover `next/client`, so the
new overload cannot pull server registration into the client graph.

## 1. The `action`-based golden path — adopt

### Before / after

```ts
// Before (all three consumers today)
export const useEntityPredictions = createNextPredictedRoot({
  protocol: entityProtocol,
  send: createNextMutationSender<typeof entityProtocol>(
    applyEntityMutationAction
  ),
  refresh: useRouterRefresh,
  invalidations: axisInvalidations,
})

// After
export const useEntityPredictions = createNextPredictedRoot({
  protocol: entityProtocol,
  action: applyEntityMutationAction,
  invalidations: axisInvalidations,
})
```

### Measurements

| Module           | Tokens before | Tokens after | Package symbols imported | Concepts an adopter wires |
| ---------------- | ------------- | ------------ | ------------------------ | ------------------------- |
| entity           | 61            | 46           | 3 → 1                    | 5 → 3                     |
| combat           | 62            | 46           | 3 → 1                    | 5 → 3                     |
| dungeon          | 62            | 46           | 3 → 1                    | 5 → 3                     |
| observed fixture | 36            | 26           | 2 entries → 1 entry      | 3 → 2                     |

The deleted concepts are exactly the ones the ticket suspected were
conventions, not decisions: the sender adapter (`createNextMutationSender`),
the refresh carrier (`useRouterRefresh`), and — a real inference win — the
**explicit `<typeof entityProtocol>` type argument**. Today the sender factory
cannot infer `Protocol` because the generated action accepts `unknown`
(envelopes are strictly admitted server-side), so every consumer repeats the
protocol as a type argument. With `protocol` and `action` in one options
object, `Protocol` infers from `protocol` and the action is _checked_ against
`NextMutationAction<Protocol>`; a `@ts-expect-error` negative control proves an
action generated for a different protocol is rejected at the option site —
errors localize to the one line that is wrong, instead of surfacing inside the
sender factory's return-type mismatch.

That check needs one deliberate mechanism (added after external review caught
the gap): because the generated action's parameter is `unknown` and an app's
`"use server"` wrapper preserves only the return type, two protocols with
compatible refusal unions would otherwise cross-assign and fail only at
runtime (`invalid-protocol` → uncertain delivery). The generated action's
outcome therefore carries a phantom `ProtocolIdentity<Protocol["id"]>` — an
optional, never-materialized property whose literal id makes structural
assignability compare protocol identities. A second negative control pins it:
a refusal-compatible action with the real generated shape was proven to
compile before the brand and is rejected after it.

The three options remaining are precisely the module's documented purpose
("this module owns only the app's three seams: the protocol, the Server Action,
and the invalidation transport") — the golden path makes that sentence the
literal API.

### Shape decisions

- **Overload, not a new factory name.** `createNextPredictedRoot` keeps one
  name; the second overload accepts `{ protocol, action, refresh?, invalidations? }`.
  The explicit `send`/`refresh` form remains untouched for snapshot carriers,
  tests, and unusual delivery adapters (all existing package tests pass
  unchanged).
- **`refresh` stays overridable in the action form** — the action implies the
  router carrier as a _default_, not a constraint.
- **`createNextObservedRoot` defaults the same carrier.** Safe: an observed
  root has no delivery seam, so the only Next-specific fact is the carrier, and
  the router adapter's 250 ms acceptance grace is inert without acceptances.
  Contract tests drive it through the in-memory invalidation adapter (fresher
  invalidation → the defaulted carrier requests a canon; explicit override
  wins). Since no production observed consumer exists yet, this ships as
  package capability and waits for the watch-view migration to earn its first
  call site.

New package tests cover the action form end to end: accepted stamps pass
through, a rejected terminal outcome maps to the domain refusal, exhausted
authority contention redelivers **the same envelope and mutation ID** (the
sender's `RetryableDeliveryError` classification, previously exercised only via
the explicit form), and the defaulted carrier requests `router.refresh()` after
the 250 ms RSC grace.

## 2. Capability facades — reject

Auth.js's composition root earns its shape because one configuration yields
**four** capabilities with distinct framework destinations (`handlers`, `auth`,
`signIn`, `signOut`) that must share session policy. Headcanon's boundaries
each yield **one**:

- Server: `createNextMutationAction(...)` already returns the single capability
  (the action). `createNextHeadcanonServer(...)` returning `{ execute }` is a
  wrapper that only delegates — vestigial indirection with a destructuring tax.
- Client: `createNextPredictedRoot` returns the single hook. A
  `createNextHeadcanonClient` returning `{ usePredictions, useObserved }` would
  bundle two roots that share **no configuration** beyond the invalidation
  transport: the predicted root is per-protocol, the observed root takes no
  protocol at all, and no current consumer mounts both from one composition.

Client/server dependency graphs are already separated by package _entries_
(`next/client` vs `next/server`) and enforced by the dependency gate; a facade
adds no additional safety. The smaller abstraction — proposal 1's overload —
delivers the entire measured contraction. Revisit only if a future consumer
genuinely composes multiple client capabilities from one configuration.

## 3. Self-identifying commands — reject (reconciled with UNN-686)

The proposal: `defineMutationCommand(entityWrite, { screen, admit, execute,
finalizeAccepted })`, so server composition lists `commands:
[entityWriteCommand, ...]` without repeating `bindMutation(definition,
command)`.

Two findings close this:

1. **UNN-686 already evaluated a command factory and rejected it** — curried
   identity calls reduced repeated generic arguments but "made declarations
   less direct"; the adopter-local `EntityMutationCommand` alias was the
   accepted answer. The self-identifying variant is the same factory with the
   definition as its first argument.
2. **A fresh inference experiment confirms the factory deletes nothing.**
   Passing an unannotated command literal directly to `bindMutation` (the
   identical inference problem) infers `Actor`, `Preflight`, and `Transaction`
   as `unknown` — three `TS2345` errors at the first real call. Generic
   parameters infer _from_ the literal; a factory cannot supply them _to_ it.
   So the `satisfies EntityMutationCommand<typeof entityWrite, …>` alias
   remains mandatory either way, and the definition reference it contains
   already self-identifies the command at its declaration site.

What would actually move: three `bindMutation` calls and three definition
imports leave `apply.ts`; three factory wraps enter `commands.ts`. Net ≈ −10
tokens per aggregate, pure relocation — and the ticket's own bar is "prefer
deleting adopter wiring over merely relocating it." The composition root also
_gains_ from the current shape: `apply.ts`'s command list is the Auth.js
"providers array" of this design — the one place the protocol ↔ command pairing
is visible and type-checked complete (`CompleteBindings` + the load-bearing
`bindMutation` negative typecheck from UNN-685's falsification gates). Nothing
about the proven `screen` / `admit` / `execute` / repeat-safe finalization
lifecycle would change; that is precisely why the change does not pay.

### 3b. Revisited with API changes allowed: the scoped definer

Review asked whether reshaping `bindMutation` itself could make the factory
work. It can — the flat factory's blocker (generics infer _from_ arguments, so
a call can't push `Actor`/`Preflight`/`Transaction` _into_ an unannotated
literal) disappears if the app fixes those types **once** in a curried,
authority-scoped definer:

```ts
// Once per app (entity, combat, and dungeon share these types today):
const defineEntityMutationCommand = createMutationCommandDefiner<
  Actor,
  ReturnType<typeof getDb>,
  DrizzleMutationTx<ReturnType<typeof getDb>>
>()

// Per command — no `satisfies`, full contextual typing:
export const entityWriteCommand = defineEntityMutationCommand(entityWrite, {
  async screen({ executor, actor, args }) { … },
  async admit({ tx, actor, args }) { … },
  async execute({ tx, args, evidence, stamp }) { … },
  finalizeAccepted({ args, stamp, projection }) { … },
})

// apply.ts:
commands: [entityWriteCommand, entityIdentityCommand, entityFinalizeCommand]
```

Prototyped end to end (`createMutationCommandDefiner` in `next/server.ts`;
twins `commands.definer.spike.ts` / `apply.definer.spike.ts`; probe record in
`q3-probes.spike.ts`). What the prototype **proved**:

- All three entity commands — including preconditioned finalize — typecheck
  with **no `satisfies` clause and no aliases**; `Projection` and `Evidence`
  infer cross-member from `screen`/`admit` returns into
  `finalizeAccepted`/`execute` parameters.
- `createNextMutationAction` accepts the self-identifying bindings directly,
  and the wrong-pairing negative typecheck survives (`@ts-expect-error`
  verified, with a precise "screen's args are incompatible" diagnosis).
- This is genuine **deletion**, not relocation: entity aggregate 1281 → 1180
  tokens (−101, ≈ −8 %) — the two aliases, three `satisfies` clauses, three
  `bindMutation` wraps, and three definition imports all go; one definer
  creation (~30 tokens, shareable app-wide) comes back.

What the probes **cost it**:

- **Member-order-sensitive inference (probe A).** Listing `execute` before
  `admit` collapses `Evidence` to `unknown` — TypeScript fixes type parameters
  processing context-sensitive members top-to-bottom. The failure is loud but
  misleading (`'unknown' is not assignable to 'AdmittedEntityWrite'` at the
  use site, no hint that member order is the cause), and nothing enforces the
  lifecycle order in the literal.
- **Degraded error localization (probe B).** A wrong `screen` projection
  surfaces at its consumer inside `finalizeAccepted`, not at the wrong return;
  the `satisfies` form errors at the declaration because `Projection` is
  stated, not inferred. The stated types also _document_ each command's
  projection/evidence contract — a legibility loss the token count doesn't
  show.
- **The definer value itself isn't portable** (TS2883: its inferred type names
  the unexported `AnyMutationDefinition`), so the recommended one-definer-
  per-app shape requires the package to export a nameable
  `MutationCommandDefiner` type and its constraints.
- UNN-685's "one registration interface" resolution means adoption replaces
  `bindMutation` everywhere, not joins it.

**Recommendation: keep the rejection for the published default, with the
decision now priced rather than blocked.** The gain is happy-path ergonomics
(−8 %, no ceremony); the costs are unhappy-path diagnostics that third-party
adopters of a published package would hit blind. If the satisfies deletion is
wanted anyway, the shape that removes the order fragility _structurally_ is a
staged builder (`.screen(…).admit(…).execute(…)`), which enforces
inference order by construction — at the price of exactly the callback-
configuration machinery UNN-686 declined. That variant was not prototyped.

### 3c. Review outcome

Review sharpened the order-sensitivity objection into a named distinction:
accepted order-dependences (`useState`'s tuple, Express middleware, the rules
of hooks) are **declared and semantic** — the order is the contract, enforced
where the mistake is made, and reordering changes behavior — while the
definer's is **incidental**: the object type says order is irrelevant, runtime
behavior is identical under reorder, and the constraint exists only in the
checker's inference pass. The rules-of-hooks precedent shows the honest
mitigation: constraints the type system can't see become acceptable when
promoted to mechanical enforcement (`eslint-plugin-react-hooks`). With a lint
rule pinning lifecycle member order, the remaining question — definer-with-
enforcement versus `satisfies` — is taste that needs results in anger.

The staged builder stays rejected on the Replica lesson
(`docs/lessons/2026-07-20-unopinionated-abstraction-is-a-passthrough.md`),
read from the other direction: the command seam is already opinionated (the
lifecycle is hidden decision, the callbacks are proven variation — UNN-685's
deletion ledger is the receipt), so the builder would add machinery that hides
no decision and adds no law, and a builder is the accretion-prone shape most
likely to drift into callback configuration.

**Resolution: UNN-691** refactors all three aggregates onto the definer with
the lint rule, logs real-world error localization, and records a go/no-go —
on go, `bindMutation` is deleted; on no-go, the refactor reverts with
rationale.

## 4. Grouping recovery controls — reject

Proposed: `{ value, mutate, recovery: { status, conflicts, retryDelivery,
retryRefresh } }`.

The measurement against real consumers falsifies the premise that everything
outside `value`/`mutate` is exceptional:

- **`status.pending` is a daily field.** `prep.tsx`, `encounter-staging.tsx`,
  and `use-dungeon-console.ts` derive `isPending` spinners from it. Moving
  `status` under `recovery` demotes an ordinary-consumer surface; keeping
  `pending` top-level while moving the rest splits `IncorporationStatus`
  (whose `freshness`/`stallReason`/`missingAxes`/`invalidations` do read as
  recovery — every UI access is `freshness === "stalled"`).
- **Impact:** ~28 renamed member accesses across five app modules
  (`use-entity-write.tsx`, `use-dungeon-console.ts`, `use-combatant-write.ts`,
  `prep.tsx`, `encounter-staging.tsx`), plus the package result assembly,
  `PredictedRoot`/`ProtocolPredictedRoot` types, and every root test — and
  **zero lines deleted**. Type ergonomics do not improve; destructuring gains a
  level.

The genuinely interesting fact the survey surfaced: the recovery surface is
consumed through **three near-identical toast-wiring blocks** (uncertain →
retry toast, stalled → refresh toast, conflicts-length watch → jossed toast) in
`use-entity-write.tsx`, `use-dungeon-console.ts`, and `use-combatant-write.ts`.
The available contraction was app-owned recovery-toast policy plus
package-owned root-lifetime observation. The landed shape puts
`recoveryListeners` on the predicted root, keeps Sonner copy and action labels
in a pure app adapter, and hides entry/cleanup/conflict-deduplication inside the
package. It shrinks adopter code far more than any regrouping of the result
object.

Ordinary consumers already experience the dominance the ticket wants: `value`
and `mutate` lead the interface, and providers (not leaf components) absorb the
recovery fields today.

## 5. Conventions and forbidden inference — narrow

Safe conventions Headcanon now owns (via proposal 1) or already owned:

| Convention                                                | Status                                                     |
| --------------------------------------------------------- | ---------------------------------------------------------- |
| Raw generated Server Action ⇒ standard sender adapter     | Adopted — `action` overload                                |
| Next RSC binding ⇒ App Router refresh carrier (250 ms)    | Adopted — `action` overload + `createNextObservedRoot`     |
| Omitted client `invalidations` ⇒ no realtime              | Already true (`invalidations?` on every root options type) |
| Preconfigured Drizzle and Ably adapters                   | Already true (`/drizzle`, `/ably/*` entries)               |
| Server no-realtime mode (omit publisher **and** reporter) | **Deferred** — no consumer; see below                      |

The server no-realtime mode is real but hypothetical here: Showtime always
passes `entityInvalidationPublisher`, which itself no-ops when `ABLY_API_KEY`
is absent, and publication is advisory by design. Making
`invalidations`/`reportInvalidationFailure` optional-together is a two-overload
change with no adopter to prove it against — one adapter is hypothetical; add
it when a second adopter (or OSS publication) supplies the evidence.

Facts Headcanon must **never** infer, because they are application decisions
(this list should ride along into the README with proposal 6): actor identity;
authority policy (screening, admission, in-transaction authorization);
mutation semantics (predictors, refusal vocabularies); storage axes and every
guarded version write; projection dependencies; storage scope/home (combat's
inline-vs-durable locator stays inside the transaction); redaction; and
external-commit context (Server Action vs Route Handler finalizers stay
separately named).

## 6. Golden-path README draft — adopt

Drop-in opening for `packages/headcanon/README.md`, between the tagline and
"Protocol core"; the architecture inventory follows it unchanged.

---

### One complete path

Everything below is one feature: a rename that the UI believes instantly and
canon confirms.

**1. Define the mutation and protocol once — client-safe, shared by browser
and server.**

```ts
// domain/notes/protocol.ts
import { defineMutation, defineProtocol } from "@workspace/headcanon"

export const renameNote = defineMutation({
  name: "notes.rename",
  args: renameArgsSchema, // any Standard Schema parser (e.g. Zod)
  predict: (state: NotesState, args) => ok(applyRename(state, args)),
  refusal: renameRefusalSchema, // structured, survives receipts exactly
})

export const notesProtocol = defineProtocol({
  id: "myapp.notes.v1",
  mutations: [renameNote],
})
```

**2. Bind the server command and generate the Server Action.**

```ts
// lib/actions/notes/apply.ts
"use server"

import { createDrizzleMutationAuthority } from "@workspace/headcanon/drizzle"
import {
  bindMutation,
  createNextMutationAction,
} from "@workspace/headcanon/next/server"

const executeNotesMutation = createNextMutationAction({
  protocol: notesProtocol,
  actor: requireActor, // you derive the trusted actor; it never rides the wire
  authority: createDrizzleMutationAuthority({
    db,
    scope: (actor) => actor.userId,
  }),
  commands: [bindMutation(renameNote, renameNoteCommand)], // screen / admit / execute / finalizeAccepted
  invalidations: notesInvalidationPublisher,
  reportInvalidationFailure,
})

export async function applyNotesMutationAction(envelope: unknown) {
  return executeNotesMutation(envelope)
}
```

**3. Create the client predicted root from the action.**

```ts
// domain/notes/use-note-predictions.ts
"use client"

import { createNextPredictedRoot } from "@workspace/headcanon/next/client"

export const useNotePredictions = createNextPredictedRoot({
  protocol: notesProtocol,
  action: applyNotesMutationAction,
  invalidations: axisInvalidations, // omit for no realtime
})
```

**4. Mount it over the route's canon and mutate.**

```tsx
function NoteTitle({ canon }: { canon: Canon<NotesState> }) {
  const { value, mutate } = useNotePredictions({ canon })

  const rename = (title: string) => {
    const receipt = mutate(renameNote({ noteId: value.focused, title }))
    if (!receipt.ok) return toast.error(copyFor(receipt.error)) // refused locally
    return receipt.value
  }
  // `value` already shows the rename — same predictor the server validates with.
}
```

**5. Await the milestones you care about.**

```ts
const receipt = rename("Chapter Two")
const accepted = await receipt.accepted // Result<AcceptedStamp, …> — authority committed
const canonized = await receipt.canonized // Result<void, …> — canon now covers the stamp
```

That configuration bought you: one ordered delivery queue with durable mutation
identity; ambiguous-delivery recovery that redelivers the exact envelope;
receipt-deduplicated, contention-retried transactional execution; structured
refusals recovered exactly from duplicate receipts; per-axis cache-tag expiry,
route refresh, and realtime invalidation derived from each accepted stamp;
rebase of pending intent over every newer canon; and typed `accepted` /
`canonized` milestones that never reject. What Headcanon will never decide for
you: your actor, your authorization, your mutation semantics, your axes, or
where state lives — see the protocol and adapter sections below.

---

## Follow-ups (filed 2026-07-22, decisions reviewed and accepted)

1. **UNN-689 — promote proposal 1:** switch the three predicted-root consumers
   to the `action` form, delete their sender/refresh wiring, land the README
   opening (proposal 6) with the forbidden-inference list, and delete the
   client `*.spike.ts` twins. `createNextMutationSender` stays exported for
   the explicit form.
2. **UNN-690 — recovery listeners and app-side toasts:** completed with
   package-owned `recoveryListeners` and the app's pure
   `mutationRecoveryToasts(options)` adapter (finding under proposal 4).
3. **UNN-681 — P4 publication decision:** this document is linked from the
   P4a ticket; the no-realtime server mode (proposal 5) is the one deferred
   item an external adopter would likely request first.
4. **UNN-691 — definer spike in anger (§3c):** refactor entity, combat, and
   dungeon onto `defineMutationCommand` with the lifecycle-order ESLint rule;
   record a go/no-go. Owns the definer spike twins, `q3-probes.spike.ts`, and
   the version-writer allowlist spike entry.
