# P2g mutation-seam investigation

**Ticket:** UNN-685 — Headcanon P2g: Prove the mutation seam is deep before Phase 3
**Date:** 2026-07-21
**Status:** Prototype passed; Phase 3 mutation rollout may proceed

## Decision

**Redesign the authority-side registration seam before Phase 3, while retaining
Headcanon’s protocol, predicted-root, receipt, retry, stamp, refresh, and
invalidation modules.**

The package is deep where it owns mutation lifecycle and authority coordination.
The pre-prototype Showtime binding was shallow where it reconstructed the registered
mutation distinction across target parsers, the Server Action door, a handler
map, rejection unions, receipt parsing, client delivery mapping, and
post-accept projections.

This is a narrow redesign recommendation, not a recommendation to abandon
Headcanon or reopen the client lifecycle. P3a, P3b, and P3c were blocked on an
`entity.write` plus `entity.finalize` prototype demonstrating that the new seam
deletes this application coordination instead of relocating it. The prototype
below clears that gate.

## Prototype outcome

**Go.** Option 2 is now the implemented authority-registration seam.

The prototype introduces `createNextMutationAction` and a definition-keyed
`bindMutation` command list. The package derives strict preparation, command
selection, preflight admission, retry-time admission, receipt execution,
mutation-specific refusal decoding, terminal denial, stamp finalization, and
same-ID `finalizeAccepted` recovery from that list. Its Next client adapter now
owns the generic accepted/refused/contention mapping.

A follow-up deletion pass removed the superseded
`createNextMutationExecutor`/`createMutationExecutor` and `MutationHandlers`
interface rather than preserving two registration shapes. It also removed the
protocol-wide `rejections<T>()` phantom carrier: every public authority refusal
now belongs to the selected mutation definition and crosses receipts through
that mutation's runtime codec. Authority adapter contracts exercise the
action's internal prepared-request seam directly without publishing a second
consumer interface.

The Showtime binding contracts to one generated Server Action and one
server-only command module. It deletes every registration-glue target listed
below: the target parsers, action branch ladder, second handler map, broad server
rejection union/parser, client authorization filtering and outcome mapping, and
the three `execute-*` adapters. Structured finalize refusals now survive intact
and the UI can surface their recorded reason.

The Store experiment also passed the combat constraint. `entity.write` now has
attempt-local `admitEntityWrite` and `commitAdmittedEntityWrite` halves for the
manifest, while `commitEntityWrite` remains combat's one-call external surface
and composes those exact halves. Combat's durable arm was not changed and cannot
sequence the internal operations itself.

### Measured contraction

Under the deletion-ledger method, the working diff is **−57 net production code
lines in `apps/web`** and **−271 net app test code lines**:

- production coordination deleted: −316;
- application domain capability added or reshaped: +259;
- old coordination tests deleted: −473; and
- replacement app-semantic tests added: +202.

The production additions are the command module (+176), admitted Store halves
(+53), and refusal codecs plus correlated app typing (+30). Package
implementation and package contract tests remain outside the
application-contraction measure.

### Falsification results

| Gate                                  | Result                                                                                                                         |
| ------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| Missing and duplicate registration    | Pass — missing and duplicate command lists fail construction; the list is also type-exhaustive                                 |
| Wrong definition/args pairing         | Pass — `bindMutation` rejects a command whose declared args belong to another mutation; the negative typecheck is load-bearing |
| Malformed or unknown envelope         | Pass — preparation returns before admission and no receipt is claimed                                                          |
| Preflight denial                      | Pass — translates to `forbidden()` with no receipt                                                                             |
| Authorization revoked after preflight | Pass — records package-owned `denied`, rolls back domain work, and recovers the denial on same-ID delivery                     |
| Contention retry                      | Pass — admission reruns against fresh transaction state and attempt-local stamps                                               |
| Structured refusal recovery           | Pass — finalize's object refusal is codec-validated and recovered exactly; corrupt refusal data fails closed                   |
| Accepted projection semantics         | Pass — it never runs for refusal and reruns on accepted same-ID recovery                                                       |
| Client/server boundary                | Pass — the package client-entry dependency gate cannot reach the server registration                                           |
| Combat Store coherence                | Pass — combat still calls only composed `commitEntityWrite`; the command uses its exact internal halves                        |
| Axis cardinality                      | Pass — existing dual-axis contracts remain green and a three-axis command needs no interface field                             |
| Application contraction               | Pass — −57 production code lines and deletion of the distributed registration layer                                            |

## Scope and method

The investigation:

1. reproduced the UNN-677 production-line measurement and combined it with the
   existing UNN-676 ledger result;
2. classified the Phase 2 additions by ownership rather than treating raw LOC
   as the verdict;
3. traced the complete marginal path for registering `entity.finalize`;
4. applied the deletion test to the package and the application binding
   separately;
5. compared three materially different interfaces; and
6. tested the preferred direction against both ordinary entity writes and the
   preconditioned finalize command.

The current epic branch is the evidence base. No behavior in this document is
inferred from the earlier design alone when current code or executable tests are
available.

## Findings

### Measurement

The [deletion ledger](./deletion-ledger.md) records UNN-676 at **+38 net
production code lines in `apps/web`**: −297 lines of old coordination and +261
lines of new capability.

The UNN-677 change from `18283abb` to `f58c31dd` measures **+64 production code
lines** under the same lens:

- count TypeScript/TSX code lines only;
- exclude comments and blanks;
- exclude docs, `*.test.*`, and `*.mjs`; and
- compare the post-UNN-676 base with the post-UNN-677 tip.

The approximate Phase 2 running total is therefore **+102**, versus the original
−300 to −500 planning diagnostic. This is evidence of a marginal-integration
problem, not by itself a verdict on the package.

### Baseline verification

The pre-prototype behavior was sound under the focused executable checks:

- 42 tests passed across the entity protocol, predicted binding, action door,
  finalize handler, and version guard;
- 14 Headcanon protocol and Next adapter tests passed; and
- the web dependency and version-write architecture gate passed.

The issue was interface depth, not a demonstrated correctness failure.

### Responsibility classification

| Category                                    | Current examples                                                                                                                                                                                      | Disposition                                                        |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------ |
| Application-owned domain semantics          | Finalize validation and seeded patch; class-dependent entity authorization; ownership; transaction bodies; combat locator policy; character-list projection; UI copy and navigation                   | Keep in Showtime                                                   |
| Genuinely new capability                    | Receipt-backed finalize; atomic identity-axis/status commit; contention retry; accepted stamps; stamp-derived cache expiry and invalidation; version-write architecture enforcement                   | Keep behind Headcanon or its application authority module          |
| Transitional bridges                        | Legacy `character:{shortId}` ping publication; combat’s `finalizeExternalActionCommit`; explicit `revalidateEntity` while character loads are not axis-tagged                                         | Delete through named tickets before claiming end-state contraction |
| Mutation-registration and coordination glue | Name-aware target parsers; door branch ladder; second handler map; broad rejection union; cast-based receipt parser; client authorization filtering; delivery-outcome mapping; delegate-only handlers | Redesign target                                                    |

Two transitional bridges already have a named deletion ticket: the legacy ping
and combat external finalizer fall in P3a, UNN-678. The explicit
`revalidateEntity` bridge says it disappears when the loader adopts
`tagVersionedBase`, but the current P3 ticket set does not name that deletion
clearly enough. It needs an explicit home before being credited as transitional.

## The complete marginal path

Adding `entity.finalize` required the following application decisions or
registrations.

| Concern                          | Baseline home(s)                                                                                                                                                | Assessment                                                                                                                                           |
| -------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Stable name                      | [`domain/entity/commit/protocol.ts`](../../apps/web/domain/entity/commit/protocol.ts), plus the now-deleted string-keyed handler map in `mutations/executor.ts` | The mutation definition should be the identity token; the string should not be repeated                                                              |
| Argument schema                  | `entityFinalizeArgs` in the client-safe protocol; formerly reparsed by the deleted `mutations/authorize.ts` and again by the package executor                   | One schema authority, but two parsing/dispatch paths because admission cannot run between package parsing and receipt execution                      |
| Predictor and local refusal      | `entityFinalize.predict` and `toEntityFinalizeRefusal` in the protocol                                                                                          | Application-owned and correctly client-safe, but structured information is lost                                                                      |
| Trusted actor                    | `requireActor()` in [`mutations/apply.ts`](../../apps/web/lib/actions/entity/mutations/apply.ts)                                                                | Correct single authority; actor does not ride the wire                                                                                               |
| Fail-closed preauthorization     | Manual mutation-name parsing followed by `requireEntityOwner` or `requireEntityWriteAuthorized` in the door                                                     | Required behavior; manual dispatch is not required application policy                                                                                |
| In-transaction authorization     | `authorizeEntityWrite` in the entity Store; direct `pc.userId` comparisons in identity/finalize handlers                                                        | Entity write reuses one rule correctly; identity/finalize express ownership twice in different forms                                                 |
| Handler                          | String entry in `handlers`, then a separate `execute-*` module                                                                                                  | Finalize contains real command semantics; entity/identity handler adapters mostly delegate                                                           |
| Rejection vocabulary             | Client authority union, protocol-wide server union, string receipt parser, authorization translation sets, and UI cases                                         | Several audiences are legitimate; the broad uncorrelated union and unchecked parser are not                                                          |
| Invalidation                     | Handler stamps axes; Headcanon derives cache expiry and axis invalidation                                                                                       | Already deep; do not move axis policy back into registration                                                                                         |
| Post-accept projections          | Route revalidation, legacy ping, and character-list branching in the action door                                                                                | Application-owned policy, but its selection should live beside the registered command rather than in a second dispatcher                             |
| Static version-write enforcement | Registered-handler entries in [`depcheck-allowlist.mjs`](../../apps/web/depcheck-allowlist.mjs)                                                                 | App-owned enforcement; the redesigned registration should give the gate one stable pattern rather than require a new scattered exception per command |
| Client convenience               | `useFinalizeEntity` and the finalize button                                                                                                                     | Legitimate UI/domain interface, not authority-registration glue                                                                                      |

### Structured-refusal failure

`FinalizeRefusal` contains a useful structured value:

```ts
{
  kind: "missing-requirement"
  stepSlug: GatedStepSlug
  reason: string
}
```

The baseline protocol converted it to `"missing-finalize-requirement"`. Its
handler test explicitly proved this lossy conversion because the now-deleted
`mutations/rejection.ts` accepted any string and rejected structured JSON.

This is the clearest evidence that the current seam has erased application
knowledge and forced the caller to reconstruct a weaker vocabulary. Headcanon’s
receipt adapter can store JSON; the missing piece is a runtime, mutation-specific
refusal codec carried through registration and duplicate recovery.

## Deletion and marginal-integration tests

Deleting Headcanon’s lifecycle and authority modules would fan the following
knowledge back into every caller:

- ordered optimistic Actions and replay;
- durable mutation identity and ambiguous redelivery;
- canonical invocation equality;
- receipt deduplication, savepoints, and contention retry;
- attempt-local accepted stamps;
- cache-tag expiry and invalidation publication;
- canonization, refresh coalescing, and stall detection; and
- framework control-flow preservation.

Those modules pass the deletion test.

Deleting the present application registration layer would not erase application
domain semantics. It would mainly erase manual envelope discrimination, branch
dispatch, delegate adapters, union reconstruction, and projection routing. Those
facts should be derived from one app-owned registration. The present binding
therefore fails the marginal-integration test even though the underlying package
passes the broader deletion test.

One important counterexample is `entity.write`: it is already the correct
coarse-grained mutation. Many Writer families fit behind one registered
descriptor union, predictor, authorization posture, and Store. Phase 3 should
preserve that discipline rather than register one protocol mutation per small
combat or dungeon operation.

## Constraints every option must satisfy

Any acceptable interface must preserve all of the following:

1. The shared protocol stays client-safe: stable name, argument schema,
   deterministic predictor, and public structured refusal schema only.
2. The Server Action derives the trusted actor.
3. Malformed, unknown, and preauthorization-denied requests claim no receipt.
4. Authorization reruns inside every transaction attempt against current state.
5. Preauthorization evidence is never transaction authority.
6. Expected domain refusals remain structured, serializable, and exactly
   recoverable from duplicate receipts.
7. An authorization denial discovered inside an attempt is a package-owned
   terminal denial, never a public domain refusal.
8. Receipt identity, retry, savepoint behavior, stamps, cache expiry, route
   refresh, and axis invalidation remain package-owned.
9. Post-accept application projections are repeat-safe, explicitly ordered after
   the accepted receipt and package finalization, and rerun on same-ID accepted
   receipt recovery.
10. Combat derives inline versus durable storage from its trusted locator inside
    the transaction; no storage-home or axis claim enters the wire.
11. Dual- and three-axis commands use the same interface and existing domain lock
    order without new receipt or invalidation concepts.

## Option 1 — keep the current interface

### Shape

Keep the client protocol, manual target parsers, Server Action branch ladder,
typed handler map, protocol-wide rejection union/parser, and client send adapter.
Register new mutations only when their semantics are materially different;
prefer coarse descriptor unions such as `entity.write`.

### Case for it

- The current behavior is correct and tested.
- `MutationHandlers` is exhaustive over the client protocol.
- The application policies really do vary: authorization, persistence,
  projections, and UI behavior cannot be moved into Headcanon merely to reduce
  LOC.
- Phase 3 may need only a small number of coarse registered mutations.

### Why it is not recommended

The application-owned policies do not require a second name-aware envelope
parser, another dispatcher, a broad receipt parser, client authorization-union
reconstruction, or delegate-only handler modules. Finalize also demonstrates
that structured refusals do not survive the current registration path.

This option is falsified if the next unlike registered command again edits the
target parser, door branches, handler map, rejection union/parser, client send
adapter, and post-accept dispatcher. The current finalize integration has already
produced that result.

## Option 2 — typed app-owned command manifest

### Shape

Keep one client-safe mutation definition, then bind that definition object once
to a server-only application command. A package-owned Next action module derives
parsing, dispatch, receipt decoding, retry, invalidation finalization, and client
delivery mapping.

Illustrative interface:

```ts
const entityProtocol = defineProtocol({
  id: "showtime.entity.v1",
  mutations: [entityWrite, entityIdentity, entityFinalize],
})

export const applyEntityMutationAction = createNextMutationAction({
  protocol: entityProtocol,
  actor: requireActor,
  authority: drizzleAuthority,
  invalidations: entityInvalidationPublisher,
  commands: [
    bindMutation(entityWrite, entityWriteCommand),
    bindMutation(entityIdentity, identityWriteCommand),
    bindMutation(entityFinalize, finalizeCommand),
  ],
})
```

`createNextMutationAction` is the working third-party name. It says what the
consumer receives—a Next Server Action—without requiring Showtime's internal
"door" vocabulary or inventing a branded term that hides the framework role.

The mutation definition is the registration token. No server code repeats
`"entity.finalize"`. Each mutation carries a Standard Schema-compatible public
refusal codec.

A command has a small application-owned shape:

```ts
interface MutationCommand<
  Args,
  Actor,
  Preflight,
  Tx,
  Projection,
  Evidence,
  Refusal,
> {
  screen(context: {
    executor: Preflight
    actor: Actor
    args: Args
  }): Promise<Screening<Projection>>

  admit(context: {
    tx: Tx
    actor: Actor
    args: Args
  }): Promise<Admission<Evidence>>

  execute(context: {
    tx: Tx
    actor: Actor
    args: Args
    evidence: Evidence
    stamp: StampAccumulator
  }): Promise<AttemptDecision<Refusal>>

  finalizeAccepted?(context: {
    actor: Actor
    args: Args
    stamp: AcceptedStamp
    projection: Projection
  }): void | Promise<void>
}
```

`Admission` distinguishes `allowed` from `denied`. `AttemptDecision`
distinguishes accepted, public domain refusal, and authorization denial. A
preflight denial becomes framework control flow and writes no receipt. An
in-transaction denial after an authorization race is recorded as a package-owned
terminal denial and translated to framework control flow after the transaction.

The package calls `screen` once before receipt execution and `admit` inside every
transaction attempt. Only fresh transactional evidence reaches `execute`.
`finalizeAccepted` receives only the immutable screening projection for
repeat-safe work such as path invalidation or a transitional ping.

### Ordinary `entity.write`

Admission loads the current player character and calls the existing
class-dependent authorization policy using the supplied executor. The
transactional call returns the freshly authorized row as evidence. Execution
loads the engine value from that row, applies the Writer, performs the guarded
axis advance, and stamps it.

The prototype must reshape the existing Store coherently around that authorized
evidence. It must not add a second transaction-aware Store or re-load the same
facts through parallel abstractions.

The concrete constraint is combat's durable
[`entityRowStore`](../../apps/web/lib/actions/combat/commit/stores.ts), which
currently calls `commitEntityWrite(db, actor, args, stamp)` outside the mutation
protocol. The prototype may split the Store internally so the manifest can use
typed admitted evidence, but the one-call `commitEntityWrite` composition must
remain the external-caller interface until P3a migrates combat. That wrapper must
compose the exact same authorization and commit implementation as the registered
command; combat must not learn how to sequence the internal halves, and a second
self-authorizing implementation must not survive beside them.

### Preconditioned `entity.finalize`

Admission enforces strict ownership. Execution, inside every receipt attempt:

1. checks `status === "draft"`;
2. loads the current entity;
3. builds the seeded patch;
4. preserves the structured finalize refusal;
5. advances and stamps the identity axis; and
6. flips the subtype status in the same transaction.

Its accepted projection revalidates the character list and, until their deletion
conditions land, the route and legacy ping bridge.

### Strengths

- One registration home per mutation.
- Small common-caller interface.
- Authorization order becomes a package invariant rather than prose.
- Per-mutation refusal correlation survives storage and client inference.
- Ordinary descriptor families remain cheap.
- App authorization, persistence, and projection policy stay app-owned.

### Risks

- Type inference across a heterogeneous command list may become obscure.
- Refactoring the entity Store around admitted evidence can create two commit
  shapes: manifest callers that sequence internal halves and combat's durable
  arm calling the one-shot Store. The internal split must instead preserve one
  composed implementation and keep combat on its one-call external interface.
- `finalizeAccepted` is necessarily safe for idempotent projection work only. A
  non-idempotent effect needs a transactional outbox, not this callback.
- `finalizeAccepted` has at-least-once semantics: same-ID recovery of an accepted
  receipt reruns it. This preserves the current behavior in
  [`mutations/apply.ts`](../../apps/web/lib/actions/entity/mutations/apply.ts),
  where every recovered `kind: "accepted"` outcome reruns route/list
  revalidation and the transitional ping bridge.
- Receipt/refusal encoding may change incompatibly in this spike. The long-lived
  epic branch has its own Neon branch, no production compatibility window is
  required, and the current implementation has no receipt-pruning path. Any
  table reset or migration should still be explicit and reproducible.

## Option 3 — full capability/admission registry

### Shape

Give every registered mutation separate `preauthorize`, transactional
`authorize`, `execute`, refusal-codec, rejection-translation, and
`finalizeAccepted` capabilities. The transactional authorization step mints a typed
capability such as `AuthorizedEntityWrite`, `OwnedDraftCharacter`,
`InlineCombatant`, or `DurableCombatant`; execution cannot run without it.

### Case for it

- It models combat locator resolution and multi-row commands explicitly.
- It makes the preflight/transaction distinction impossible to ignore.
- It can express different storage topologies, axis cardinalities, structured
  errors, and projections without widening later.
- The capability is parse-don’t-validate evidence that authorization and current
  loads occurred in the right lifetime.

### Why it is not recommended yet

This interface exposes nearly every dimension that varies. It risks becoming the
same callback-heavy generic dongle the earlier Replica lesson rejected. It may
also split existing cohesive Stores into `authorize` and `execute` halves merely
to satisfy the framework.

This option earns its cost only if the two-command prototype proves that Option
2 cannot represent combat storage resolution or a three-axis dungeon command
without unsafe casts or new interface fields.

## Comparison

| Criterion              | Option 1: current                                        | Option 2: command manifest      | Option 3: capability registry |
| ---------------------- | -------------------------------------------------------- | ------------------------------- | ----------------------------- |
| Interface size         | Small package interface, large distributed app interface | Small package and app interface | Large explicit app interface  |
| Application locality   | Low                                                      | High                            | High                          |
| Common-caller leverage | Low for new registered commands                          | High                            | Medium                        |
| Multi-axis flexibility | Proven by handler shape, but registration fans out       | Expected; must be proven        | Highest                       |
| Structured refusals    | Manual and currently lossy                               | Per mutation, derived           | Per mutation, derived         |
| Authorization ordering | Convention plus tests                                    | Package-enforced                | Package-enforced              |
| Risk                   | Continued fan-out                                        | Type/Store integration          | Premature generality          |
| Decision               | Reject for Phase 3 unchanged                             | **Recommend prototype**         | Reserve as fallback           |

## Recommendation in detail

The UNN-685 implementation follows Option 2. It keeps the package’s existing lifecycle and
authority implementation, but split its executor internally into two private
stages:

1. prepare and strictly parse a typed mutation request without touching the
   receipt authority; and
2. execute that prepared request through the selected command and receipt
   adapter.

The Next action module can then derive the following sequence:

1. derive the trusted actor;
2. prepare the envelope and select the command exactly once;
3. run fail-closed admission before receipt creation;
4. enter the receipt authority;
5. rerun admission inside every transaction attempt;
6. execute with only fresh transactional evidence;
7. validate and store an accepted stamp, structured refusal, or package-owned
   terminal denial;
8. derive cache expiry, route refresh, and axis invalidation from the stamp; and
9. run the selected repeat-safe application projection, including again on
   same-ID accepted-receipt recovery.

The corresponding Next client adapter should accept the generated action and
hide the generic accepted/rejected/contention mapping currently reconstructed in
`use-entity-predictions.ts`. Application code should map only its public domain
refusal to UX.

### Required deletions

The prototype succeeds by deleting or materially collapsing:

- `lib/actions/entity/mutations/authorize.ts`;
- the mutation-name branches in `mutations/apply.ts`;
- the separate string-keyed map in `mutations/executor.ts`;
- the protocol-wide cast parser in `mutations/rejection.ts`;
- the manually maintained server rejection aggregation in `mutations/types.ts`;
- the authorization-only filtering and generic delivery mapping in
  `use-entity-predictions.ts`; and
- delegate-only `execute-entity-write.ts` and `execute-identity-write.ts`, unless
  they retain an independently useful Store-adapter decision.

The one-call `commitEntityWrite` interface is deliberately not on this deletion
list while combat's durable arm remains outside the protocol. If the prototype
splits the Store internally, that function must remain a composed wrapper over
the same implementation used by the registered command.

Application domain code, authorization rules, Stores, projections, and UI hooks
do not count as failed deletions merely because they remain.

### Marginal-integration expectation

After the prototype, a synthetic fourth registered mutation may require only:

1. one client-safe definition and protocol-list entry;
2. one app-owned command registration containing its real policy;
3. its actual domain operation; and
4. its caller or convenience hook.

It must not require edits to a target parser, Server Action dispatcher, handler
map, protocol-wide rejection union/parser, client delivery adapter, receipt
authority, cache invalidator, or realtime publisher.

### Falsification gates

The recorded `go` required the prototype to prove:

- missing and duplicate registrations fail typecheck or registry construction;
- binding a command to the wrong mutation definition fails typecheck; in
  particular, an args-type mismatch passed to `bindMutation` must not widen
  through heterogeneous-list inference;
- malformed and unknown envelopes never run admission;
- preauthorization denial creates no receipt;
- authorization revoked after preflight produces no domain effect and surfaces
  as framework control flow;
- contention reruns admission with fresh transaction state and a fresh stamp;
- structured finalize refusals survive JSON storage and exact duplicate receipt
  recovery;
- corrupt stored refusals fail closed;
- accepted projections never run for rejection or contention, rerun after
  duplicate accepted-receipt recovery, and are safe to repeat;
- the client bundle cannot reach the server registration;
- the protocol command and combat's durable arm share one coherent entity Store
  implementation; `commitEntityWrite` remains combat's one-call external surface
  and combat never composes internal admission/execution halves;
- a dual-axis and a three-axis fixture need no new interface fields; and
- the application diff contracts rather than adding another layer around the
  current action/dispatcher layer.

UNN-678 and UNN-679 can now use the proven command interface and
the marginal-integration expectation above. If the capability cases require more
interface than Option 2 can express, compare the measured prototype against
Option 3 rather than silently widening it. If neither shape contracts Showtime,
abandon the Phase 3 mutation rollout while retaining any independently useful
Headcanon modules.

## Resolved refinements

- **Consumer-facing name:** use the descriptive working name
  `createNextMutationAction`, not `createNextMutationDoor`.
- **Transaction-time authorization race:** store a package-owned terminal denial
  and translate it to framework control flow. It never joins the public domain
  refusal union.
- **Post-accept semantics:** `finalizeAccepted` reruns on same-ID recovery of an
  accepted receipt. This is existing behavior, not an optional reliability
  policy, and every registered projection must be repeat-safe.
- **Compatibility:** the epic and its database have no backwards-compatibility
  obligation. The prototype may make a breaking receipt-format change without a
  v1/v2 coexistence design.
- **One registration interface:** the definition-keyed command action replaces
  the old handler executor and protocol-wide rejection carrier; neither remains
  as a parallel package surface pending combat.

## Remaining discussion point

Which ticket owns deletion of the explicit character-route revalidation once
`tagVersionedBase` becomes load-bearing?
