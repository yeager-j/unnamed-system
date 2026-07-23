# Server Actions — the write pattern

> **Actions are the write-side seam; they stay in `lib/actions/` (UNN-610).** The
> feature-first reorg colocated every feature's components/hooks into its route
> subtree, but Server Actions did **not** move: many import the engine
> (engine types and spatial/encounter helpers), and the `app/` tier is
> hard-gated against `@workspace/game*`. `lib` (ungated) is their principled home —
> a route's client component imports the action across the `app → lib` boundary
> (downward, legal).

Every Server Action that mutates persisted state lives here. The shape is
non-negotiable: same plumbing, every file — parse the wire, authorize, persist
version-guarded, revalidate. Downstream tickets that need a write surface should
add to `lib/actions/` rather than inventing a new path (API route, ad-hoc server
function, etc.). If a use case doesn't fit, raise it.

> **Read-only actions are the sanctioned exception** (UNN-580, user-approved):
> a client that pages beyond its RSC-rendered first slice fetches through a
> read action with the same parse → gate shape and **no revalidate** —
> `campaign-updates/chronicle.ts` (`loadChroniclePageAction`) is the
> precedent. One transport style, one gate; don't mint route handlers for
> paged reads.

## Directory layout — group by aggregate

Actions are grouped into a folder per **aggregate** (the persisted entity they
write), matching how `lib/db/writes/` is organized:

```
lib/actions/<aggregate>/<slice>.ts          # the "use server" action(s)
lib/actions/<aggregate>/<slice>.schema.ts   # its Zod input schema + types
lib/actions/<aggregate>/revalidate.ts       # that aggregate's cache invalidation
```

The slice file is named for what it touches with **no aggregate prefix** — the
folder already says it (same rule as `lib/db/writes/`): `encounter/create.ts`,
not `encounter/encounter-create.ts`. Each aggregate brings its own auth gate,
concurrency token, and envelope:

| Aggregate       | Auth gate                                                                                                                                                                                                                                             | Envelope                                                                                                      | Concurrency                                                                                                                                                                             |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `entity/`       | contextual authZ (`authorize-write`: owner/owner-or-DM by class + restricted-Archetype/narrative gates) for `entity.write`, strict owner for `entity.identity` — rerun inside the Store's transaction + pre-checked at the one door (UNN-674/675/676) | the Headcanon wire: `{ protocol, mutationId, invocation }` — **no expected revision, class, axis, or actor**  | per-write-class on the `entity` row, **server-authoritative** (the Store reads the class version and guards on it; a lost race is authority contention, never a client-visible `stale`) |
| `dungeon/`      | campaign DM screening before receipt ownership, then a locked reload + authorization in every authority attempt                                                                                                                                       | `showtime.dungeon.v1` intent descriptors — **no expected revisions, axes, actor, variant, or storage claims** | dungeon-first transactions over dungeon → map-instance → encounter → region; every actual bump is stamped and lost guards rerun the whole command                                       |
| `map/`          | owner screening before receipt ownership, then a transactional live-row ownership recheck                                                                                                                                                             | `showtime.map.v1` rename or geometry-event intent — **no expected version or replacement blob**               | the authority reduces events over the row loaded in its attempt, guards the current `version`, stamps `map/{id}`, and retries contention                                                |
| `template-set/` | live-set owner screening before receipt ownership, then a transactional live-row ownership recheck                                                                                                                                                    | `showtime.template-set.v1` rename or target-scoped event batch — **no expected version or replacement blob**  | the authority reduces events over current content, guards the current `version`, stamps `template-set/{id}`, and retries contention                                                     |
| `encounter/`    | `requireCampaignDM`                                                                                                                                                                                                                                   | `encounterMutationBase` (`{ encounterId, expectedVersion }`)                                                  | single `version` per encounter                                                                                                                                                          |
| `combat/`       | campaign DM screening + per-attempt admission for `combat.write`/`combat.end`; event actions retain `requireCampaignDM`                                                                                                                               | Headcanon intent descriptors for events/writes/end — no client expected revision                              | `combat.end` derives dungeon ownership and stamps encounter + map-instance, plus dungeon when present; durable writes compose the entity Store                                          |

> **The `entity/` aggregate (UNN-551; transactional refactor UNN-674)** is the
> descriptor → Writer → Store pipeline for durable component writes. `commitEntityWrite`
> is now the **one executor-neutral Store** — it takes a supplied executor (the
> Headcanon authority's savepoint transaction, or the standalone `db`) and runs the
> whole commit inside it: load → contextual authorization (`authorize-write`) →
> pure Writer → **server-authoritative** guarded UPDATE (it reads the class version
> and guards on it — no client token) → axis stamp. It fires no transport or route-cache side
> effects itself; the registered Headcanon action owns receipt, contention retry, axis invalidation,
> and accepted-stamp finalization, then invokes the command's explicit projection callback. The
> neutral vocabulary (schema,
> `ENTITY_WRITERS`) lives in `domain/entity/commit/`. Two callers share the one
> Store: the Headcanon handler (`mutations/execute-entity-write.ts`) and combat's
> durable arm — one write architecture, one implementation. (The legacy character
> door `applyEntityWriteAction` retired with the P2d provider cutover, UNN-676.)
>
> **The identity columns joined it in UNN-675 (Headcanon P2c).** Name, pronouns,
> portrait, and notes are the registered `entity.identity` mutation:
> `commitIdentityWrite` (`identity-store.ts`) is their executor-neutral Store. So
> every user-facing write that advances `entity/{id}/identity` goes through the
> executor and gets a receipt, axis cache-tag expiry, and axis invalidation — an
> untracked bump would strand a pending prediction under the mounted predicted
> root (P2d). Portrait upload is deliberately two-stage (`portrait.ts` stores the
> Blob and returns the URL; the mutation commits it), because a rerunnable handler
> must not repeat a non-transactional effect. Finalize joined the same registry in
> UNN-677: its seeded component patch, identity-axis stamp, and
> `playerCharacter.status` flip commit inside one receipt transaction. The
> version-write tier in `depcheck.mjs` now rejects raw modeled bumps and unapproved stamped-Store
> consumers.

> **The v1 `character/` aggregate retired in UNN-562 (S4).** Durable character
> writes now go exclusively through the `entity/` door (the descriptor → Writer →
> Store pipeline above); there is no `requireOwner` / `characterMutationBase` /
> `EDIT_SURFACE_CLASS` / `bumpCharacterVersionGuarded` path anymore. The remaining
> flat `lib/actions/*.ts` files (create-campaign, delete-map, join-campaign, …)
> are **campaign/map** actions predating the aggregate-folder convention; they
> belong under their aggregate folder and move there in a dedicated tech-debt
> ticket. New actions go straight into the aggregate-folder layout.

## The pattern — two doors, one engine

Durable **character/entity** writes and the other aggregates take different doors,
but the shape rhymes: parse the wire, authorize, persist version-guarded,
revalidate.

**Durable character writes go through the entity door** (`lib/actions/entity/`,
ADR §2.4; the one Headcanon door since UNN-676). The character provider's
predicted root delivers a mutation envelope (`{ protocol, mutationId, invocation }`)
to `applyEntityMutationAction` (`mutations/apply.ts`), which authenticates
(`requireActor`), pre-authorizes fail-closed, and hands the envelope to the
executor — receipt dedup, the transactional handler, contention retry, axis
cache-tag expiry, and axis invalidation all live behind it. `entity.write`
carries a serializable component-write **descriptor** (`entityWriteSchema`,
`domain/entity/commit/write.schema.ts`) into `commitEntityWrite`; `entity.identity`
carries the per-field identity descriptor into `commitIdentityWrite` — same
protocol, same receipt ledger, no Writer for the columns. PC lifecycle state
(`builderStep`, `status`) lives on the unversioned `playerCharacter` subtype;
`finalize` spans the guarded entity and subtype halves. The neutral descriptor +
Writers are documented in **`domain/entity/commit/CLAUDE.md`**; combat's durable arm
forwards to the same composition (**`lib/actions/combat/commit/CLAUDE.md`**).

**The remaining legacy aggregates** (`encounter/` and campaign) are classic
per-file Server Actions. The Zod schema lives in `<slice>.schema.ts` alongside the
action (a `"use server"` module can only export async functions, so a client that
pre-validates imports the schema file directly). The skeleton:

```ts
// lib/actions/<aggregate>/<slice>.ts
"use server"

import { type Result } from "@workspace/result"

import { requireCampaignDM } from "@/lib/auth/viewer-role"
import { dbWrite } from "@/lib/db/writes/<aggregate>"

import {
  SomeWriteSchema,
  type SomeWriteError,
  type SomeWriteInput,
} from "./<slice>.schema"
import { revalidateAggregate } from "./revalidate"

export async function someWriteAction(
  input: SomeWriteInput
): Promise<Result<SuccessValue, SomeWriteError>> {
  const parsed = SomeWriteSchema.safeParse(input) // 1. never trust the wire
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  await requireCampaignDM(parsed.data.encounterId) // 2. the sanctioned gate — throws forbidden()

  const result = await dbWrite(parsed.data) // 3. load → pure transition → version-guarded UPDATE
  if (result.ok) revalidateAggregate(result.value) // 4. re-render dependents
  return result
}
```

`Result` comes from the neutral `@workspace/result` package. Its plain envelope is
safe for a Server Action boundary when the success value or error payload is also
serializable; payload serializability remains the action's responsibility.
Expected domain refusals return `Result.err`, while authorization/navigation
interrupts, framework control flow, and unexpected failures continue to throw.
The per-aggregate envelopes and gates are the table above.

## Concurrency

Every door is built on **per-write-class optimistic concurrency**. The durable
`entity` row carries four class tokens — `identityVersion`, `vitalsVersion`,
`inventoryVersion`, `progressionVersion` (`VersionClass`,
[`lib/db/version-classes.ts`](../db/version-classes.ts)) — and a guarded write
bumps exactly one while conditioning on `(id, <class>Version === expectedVersion)`:
`advanceEntityAxisGuarded(executor, row, class, patch, stamp)`
([`lib/actions/entity/version-guard.ts`](./entity/version-guard.ts)). Each Writer
declares which class it belongs to (`durableClass` on its `WriterMap` entry —
CH4), so the class is a property of the write, decided once. The component-column
projection (CH15) makes per-field safety **structural**: a patch's keys are 1:1
with `entity` component **columns**, so `SET`ing them touches only the written
components and cannot clobber a sibling class's column. A multi-component patch
(rest, levelUp) must keep its columns inside one class.

The Stores read the class version off the row they loaded and guard on **that**,
so a client token is neither sent nor trusted, and a lost race is contention for
the authority to rerun rather than a `stale` the client must resolve. Every call
records the accepted revision on a stamp; registered handlers let the executor finalize it and
invoke the application projection callback.

The other aggregates carry a single `version` per row (`encounter`, `map`,
`template-set`, `map-instance`, …), bumped and guarded the same way. Map,
Template Set, Dungeon, and Combat commands read those versions inside each
authority attempt and translate a lost guard into whole-command contention.
Every persistence wrapper:

- Conditions the `UPDATE` on `WHERE id = ? AND <token> = ?` and increments the
  token atomically in the same `SET`.
- Returns `err("stale")` on zero rows (disambiguated to `"entity-not-found"` /
  `"<aggregate>-not-found"` by a follow-up existence check).
- Returns the new `version` to its caller. Headcanon commands record it in the
  accepted stamp; only legacy actions return it to a client.

Per-class scoping is the load-bearing property: a debounced narrative save in
flight is not falsely staled by a vitals-counter blur. Two writes in the _same_
class still race (correctly — that's the point). The `"stale"` code is the
consumer-facing seam; swapping the underlying strategy later (serializable
transactions, refetch + retry, finer partitioning) won't touch call sites.

## Mechanic writes

Per-Archetype mechanics (Valor, Perfection, Frenzy, Stains, Path of Dawn, …) are
**ordinary component writes through the entity door** — the `mechanics` component
with its own descriptor op, predicted by `ENTITY_WRITERS` and guarded on
`vitalsVersion` like any in-play state. There is no dedicated mechanic persistence
primitive anymore (the v1 `applyMechanicStateForCharacter` retired with the v1
tables, UNN-562). The pure per-mechanic transition lives with its
`MechanicDefinition` in `packages/game-v2/src/mechanics/<lineage>/<kind>.ts`, where
the engine tests exercise it; the widget
(`components/shared/mechanics/<kind>-widget.tsx`) dispatches through
`useEntityWrite`. Adding a mechanic write is: pure transition (game-v2), a
descriptor op + Writer case (`domain/entity/commit`), a widget.

## Client patterns

Character surfaces mount **`EntityWriteProvider`** (over `{ profile, canon }`,
the Headcanon mount since UNN-676) and write through **`useEntityWrite`** /
**`useIdentityWrite`**
([`domain/entity/use-entity-write.tsx`](../../domain/entity/use-entity-write.tsx)).
The registered mutation predictors run the **same pure Writers** the server
validates with (`ENTITY_WRITERS`) and re-fold `resolveEntity` client-side, so the
predicted frame is structurally identical to the persisted result — engine
isomorphism, no merge-patch drift. The package owns delivery order, durable
mutation identity, replay, and canonization; the binding maps outcomes onto
toasts/callbacks. Two shapes recur:

### 1. Debounced auto-save on a free-text field

`useDebouncedAutoSave` (`domain/entity/use-debounced-auto-save.ts`) owns the whole
lifecycle: draft state, debounce, the in-flight guard against the debounce + blur
double-fire, `lastSavedRef` no-op skipping, Escape-to-revert, and the
failure-rollback + Sonner toast. The component renders the input and forwards
`onFocus`/`onBlur`. Example:
`app/characters/[shortId]/_components/editable-character-name.tsx`. No success indicator —
the value staying in the input is the confirmation, so a routine-save channel that
stays quiet means a real error reads as one.

### 2. Optimistic toggle on a click action

The user clicks a control (equip/unequip, a mechanic step, an inheritance-slot
pick); the provider's optimistic reducer applies the descriptor op via the same
Writer the server runs, so the optimistic frame is what the server will persist —
no drift. Revalidation then re-derives every dependent stat (attributes,
affinities, weapon attack roll). Failures toast via Sonner; React reverts the
optimistic state when the transition resolves. (Encounters use the sibling
`useCombatantWrite` — same Writers, a different reconcile channel; see
`domain/entity/commit/CLAUDE.md`.)

## Failure modes the UI must handle

| Error code                                   | Surface                                                                                                                                                                                                                                                                        |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `invalid-input`                              | Toast — generic "Couldn't save". Programmer bug.                                                                                                                                                                                                                               |
| `entity-not-found` / `<aggregate>-not-found` | Toast — the row was deleted out from under the viewer. Usually a redirect to `/`.                                                                                                                                                                                              |
| `stale`                                      | Toast — "Someone else updated this — refresh to see the latest." Optimistic rollback. (Non-entity aggregates only — entity-protocol contention is classified retryable: the predicted root redelivers on a bounded backoff and only then degrades to `delivery: "uncertain"`.) |
| Domain engine error (e.g. `item-not-found`)  | Toast — domain-specific copy (rare; usually a bug, since the affordance shouldn't have rendered).                                                                                                                                                                              |

Auth-gate failures throw via Next's `forbidden()` and never return — the client
sees a 403, not an error code. Do not try to handle this in the UI: the affordance
shouldn't be visible to non-owners in the first place (`<OwnerOnly>` enforces
this), and a 403 from a tampered call is the correct outcome.
