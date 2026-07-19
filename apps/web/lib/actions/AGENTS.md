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

| Aggregate/seam          | Auth gate                                                                                 | Envelope                                                                                                                                                                                                                                  | Concurrency                                                                                     |
| ----------------------- | ----------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| `entity/replica/`       | strict owner, recorded as a typed rejection                                               | `{ entityId, envelope: { clientGroupId, clientId, mutationId, invocation } }`                                                                                                                                                             | ordered dedup-row lock, then entity-row lock                                                    |
| `entity/` classic seams | strict owner for lifecycle; owner-or-campaign-DM inside the combat Store                  | explicit identity precondition for lifecycle; `{ entityId, expectedVersion, write }` inside combat                                                                                                                                        | per-write-class guard (`bumpEntityVersionGuarded`)                                              |
| `encounter/`            | `requireCampaignDM`                                                                       | `encounterMutationBase` (`{ encounterId, expectedVersion }`)                                                                                                                                                                              | single `version` per encounter                                                                  |
| `combat/`               | `requireCampaignDM`; `commit/` is the sanctioned two-gate exception (see its `CLAUDE.md`) | `encounterMutationBase` (+ `expectedInstanceVersion` for spatial/paired writes); `commit/` carries its own per-arm envelope (`expectedVersion` / `expectedCharacterVersion`, each optional on the wire and required by its arm — UNN-567) | encounter `version`; durable arm forwards to the entity Store and guards `entity.vitalsVersion` |
| `combat/replica/`       | typed rejections: durable push = class→posture (`authorizeEntityWriteForClass`); session push = `authorizeCampaignDMForEncounter`; batched snapshot = `requireCampaignDM` (throwing read door) | durable `{ encounterId, entityId, envelope }`, session `{ encounterId, envelope }`, batched accepted request | ordered dedup-row lock (`replicaClient` / `encounterReplicaClient`), then entity-row / encounter-row lock — no client `expectedVersion` |

> **The `entity/` aggregate (UNN-551/649)** is the descriptor → Writer → Store
> pipeline for durable component writes. The neutral vocabulary (schema,
> `ENTITY_WRITERS`) lives in `domain/entity/commit/` and is shared by the owner
> replica processor (row-locked commit) and combat's durable arm
> (`commitEntityWrite` + `bumpEntityVersionGuarded`). One write vocabulary, two
> concurrency strategies at their respective doors.

> **The `entity/replica/` door (UNN-645/648/649)** is the owner-character door:
> `pushEntityMutationAction` delivers `entity.write` component
> intent or `entity.setColumn` app-column intent
> through `createEntityPushProcessor` (`@workspace/replica`'s authority processor
> over one Drizzle transaction: `replicaClient` dedup row locked → duplicate/gap
> handled → domain write + recorded outcome commit atomically), and
> `loadEntityAcceptedAction` serves the personalized accepted snapshot as ONE
> joined statement (value/watermark/cursor, a single consistent observation).
> Two sanctioned deviations from the table above, both load-bearing: **auth
> refusals are typed rejections, not `forbidden()` throws** (a throw aborts the
> processor's transaction without advancing the client's watermark and wedges
> the client into gap refusals), and **there is no client `expectedVersion`** —
> the entity row lock inside the transaction is the concurrency strategy; the
> class version still bumps as the snapshot cursor and ping payload.

> **The `combat/replica/` doors (UNN-646)** bind combat's two persistence homes
> to the replica, one door pair per home so a confused client claim fails
> closed at the other home's decode/locator check. The **durable door**
> (`pushCombatDurableMutationAction`) is the entity door's shape over the
> `combat.entity.write` registry (the `combatEntityWriteSchema` subset — a
> non-combat arm is a RECORDED decode refusal), the same `replicaClient`
> ledger, and the entity-row lock; lock order `replicaClient → entity`. Its
> verdict also checks the **roster precondition** (auth first, then roster —
> membership must not be probeable): the entity must still be a durable
> participant of the wire's encounter, or the delivery records
> `participant-not-found` — the classic router's fail-closed locator scope at
> the classic router's advisory-read strength. The
> **session door** (`pushCombatSessionMutationAction`) runs the classic
> session Store's body (locator-derived home, Writer pre-mint, event mint,
> reduce, fail-closed serialize) under the encounter row lock with the
> `encounterReplicaClient` ledger; lock order `encounterReplicaClient →
> encounters`; `Remote = { version }` is recorded with the outcome and
> reproduced verbatim on a deduplicated redelivery. The **batched bootstrap**
> (`loadCombatAcceptedAction`) registers the inline identity plus N durable
> identities in one action (Server Actions serialize per tab) and serves each
> root's tuple from one joined statement; the durable value is the redacted
> combat root — exactly the four combat-writable components, never narrative
> or app columns (the entity snapshot door's strict-owner reservation,
> answered).

> **The v1 `character/` aggregate retired in UNN-562 (S4).** Durable character
> writes now go exclusively through the `entity/` aggregate's replica/combat
> doors described above; there is no `requireOwner` / `characterMutationBase` /
> `EDIT_SURFACE_CLASS` / `bumpCharacterVersionGuarded` path anymore. The remaining
> flat `lib/actions/*.ts` files (create-campaign, delete-map, join-campaign, …)
> are **campaign/map** actions predating the aggregate-folder convention; they
> belong under their aggregate folder and move there in a dedicated tech-debt
> ticket. New actions go straight into the aggregate-folder layout.

## The pattern — two doors, one engine

Durable **character/entity** writes and the other aggregates take different doors,
but the shape rhymes: parse the wire, authorize, persist atomically under the
door's declared concurrency strategy, then revalidate.

**Durable owner-character writes go through the replica door**
(`lib/actions/entity/replica/`, ADR §2.4). Owner character surfaces dispatch
component descriptors and replayable name/pronouns/notes/portrait-removal intent;
the processor owns row locking, Writer/column application, version bumps, and
dedup recording. PC lifecycle state (`builderStep`, `status`) lives on the
unversioned `playerCharacter` subtype; `finalize` spans the guarded entity and
subtype halves, while portrait upload retains its single-attempt Blob stage. Both
capture an explicit identity-version precondition after replica writes settle and
execute once. The neutral descriptor +
Writers are documented in **`domain/entity/commit/CLAUDE.md`**; combat's durable arm
forwards to the same composition (**`lib/actions/combat/commit/CLAUDE.md`**).

**The other aggregates** (`encounter/`, campaign, map, dungeon) are classic
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

Classic aggregate doors use **optimistic concurrency**; the owner entity replica
uses an entity-row lock plus its ordered per-client dedup ledger. The durable
`entity` row still carries four class tokens — `identityVersion`, `vitalsVersion`,
`inventoryVersion`, `progressionVersion` (`VersionClass`,
[`lib/db/version-classes.ts`](../db/version-classes.ts)) — and a guarded write
bumps exactly one while conditioning on `(id, <class>Version === expectedVersion)`:
`bumpEntityVersionGuarded(entityId, class, expectedVersion, patch)`
([`lib/actions/entity/version-guard.ts`](./entity/version-guard.ts)). Each Writer
declares which class it belongs to (`durableClass` on its `WriterMap` entry —
CH4), so the class is a property of the write, decided once. The component-column
projection (CH15) makes per-field safety **structural**: a patch's keys are 1:1
with `entity` component **columns**, so `SET`ing them touches only the written
components and cannot clobber a sibling class's column. A multi-component patch
(rest, levelUp) must keep its columns inside one class.

The other aggregates carry a single `version` per row (`encounter`,
`map-instance`, …), bumped and guarded the same way. Every wrapper:

- Conditions the `UPDATE` on `WHERE id = ? AND <token> = ?` and increments the
  token atomically in the same `SET`.
- Returns `err("stale")` on zero rows (disambiguated to `"entity-not-found"` /
  `"<aggregate>-not-found"` by a follow-up existence check).
- Returns the new `version` in the success value so the client can chain
  follow-up saves without a re-fetch.

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

Character surfaces mount **`EntityWriteProvider`** (over the loaded
`{ profile, entity, resolved }` triple) and write through **`useEntityWrite`**
([`domain/entity/use-entity-write.tsx`](../../domain/entity/use-entity-write.tsx)). It predicts
optimistically via the **same pure Writers** the server validates with
(`ENTITY_WRITERS`) and re-folds `resolveEntity` client-side, so the optimistic
frame is structurally identical to the persisted result — engine isomorphism, no
merge-patch drift — then catches up when route revalidation settles the base. Two
shapes recur:

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

| Error code                                   | Surface                                                                                           |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `invalid-input`                              | Toast — generic "Couldn't save". Programmer bug.                                                  |
| `entity-not-found` / `<aggregate>-not-found` | Toast — the row was deleted out from under the viewer. Usually a redirect to `/`.                 |
| `stale`                                      | Toast — "Someone else updated this — refresh to see the latest." Optimistic rollback.             |
| Domain engine error (e.g. `item-not-found`)  | Toast — domain-specific copy (rare; usually a bug, since the affordance shouldn't have rendered). |

Auth-gate failures throw via Next's `forbidden()` and never return — the client
sees a 403, not an error code. Do not try to handle this in the UI: the affordance
shouldn't be visible to non-owners in the first place (`<OwnerOnly>` enforces
this), and a 403 from a tampered call is the correct outcome.
