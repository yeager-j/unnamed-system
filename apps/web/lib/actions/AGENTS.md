# Server Actions — the write pattern

Every Server Action that mutates persisted state lives here. The shape is
non-negotiable: same plumbing, every file — parse the wire, authorize, persist
version-guarded, revalidate. Downstream tickets that need a write surface should
add to `lib/actions/` rather than inventing a new path (API route, ad-hoc server
function, etc.). If a use case doesn't fit, raise it.

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

| Aggregate    | Auth gate                                   | Envelope                                                                                        | Concurrency                    |
| ------------ | ------------------------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------ |
| `entity/`    | `requireOwnerOrCampaignDMForEntity` / `requireEntityOwner` (in the Store) | `{ entityId, expectedVersion, write }` (the descriptor router — UNN-551) | per-write-class on the `entity` row (`bumpEntityVersionGuarded`) |
| `encounter/` | `requireCampaignDM`                         | `encounterMutationBase` (`{ encounterId, expectedVersion }`) | single `version` per encounter |
| `combat/`    | `requireCampaignDM`; `commit/` is the sanctioned two-gate exception (see its `CLAUDE.md`) | `encounterMutationBase` (+ `expectedInstanceVersion` for spatial/paired writes); `commit/` carries its own per-arm envelope (`expectedVersion` / `expectedCharacterVersion`, each optional on the wire and required by its arm — UNN-567) | encounter `version`; `commit/`'s durable arm forwards to `entity/` and guards `entity.vitalsVersion` |

> **The `entity/` aggregate (UNN-551)** is the descriptor → Writer → Store pipeline
> for durable component writes: `commitEntityWrite` (auth + assemble + pure Writer
> + guarded column commit) and `bumpEntityVersionGuarded`. The neutral vocabulary
> (schema, `ENTITY_WRITERS`) lives in `domain/entity/commit/`. It is the shared engine
> both the character surfaces (the entity door, `applyEntityWriteAction`) and
> combat's durable arm (the encounter door forwards here) commit through — one
> write architecture, two doors.

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
ADR §2.4). A character surface's provider dispatches a serializable
component-write **descriptor** (`entityWriteSchema`, `domain/entity/commit/write.schema.ts`)
to `applyEntityWriteAction`, which hands off to `commitEntityWrite` — the shared
Store that owns auth, assembling the row into a runtime `Entity`, running the pure
**Writer** (`ENTITY_WRITERS.applyOp`), and the guarded column commit
(`bumpEntityVersionGuarded`). App-owned columns (name, portrait, pronouns, notes,
builderStep, status) stay classic per-field actions (`lib/actions/entity/columns.ts`)
composing the same guard; `finalize` spans both halves. The neutral descriptor +
Writers are documented in **`domain/entity/commit/CLAUDE.md`**; combat's durable arm
forwards to the same composition (**`lib/actions/combat/commit/CLAUDE.md`**).

**The other aggregates** (`encounter/`, campaign, map, dungeon) are classic
per-file Server Actions. The Zod schema lives in `<slice>.schema.ts` alongside the
action (a `"use server"` module can only export async functions, so a client that
pre-validates imports the schema file directly). The skeleton:

```ts
// lib/actions/<aggregate>/<slice>.ts
"use server"

import { type Result } from "@workspace/game-v2/kernel/result"

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

`Result` comes from `@workspace/game-v2/kernel/result`. The per-aggregate
envelopes and gates are the table above.

## Concurrency

Every door is built on **per-write-class optimistic concurrency**. The durable
`entity` row carries four class tokens — `identityVersion`, `vitalsVersion`,
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
(`components/character-sheet/mechanics/<kind>-widget.tsx`) dispatches through
`useEntityWrite`. Adding a mechanic write is: pure transition (game-v2), a
descriptor op + Writer case (`domain/entity/commit`), a widget.

## Client patterns

Character surfaces mount **`EntityWriteProvider`** (over the loaded
`{ profile, entity, resolved }` triple) and write through **`useEntityWrite`**
([`hooks/use-entity-write.tsx`](../../hooks/use-entity-write.tsx)). It predicts
optimistically via the **same pure Writers** the server validates with
(`ENTITY_WRITERS`) and re-folds `resolveEntity` client-side, so the optimistic
frame is structurally identical to the persisted result — engine isomorphism, no
merge-patch drift — then catches up when route revalidation settles the base. Two
shapes recur:

### 1. Debounced auto-save on a free-text field

`useDebouncedAutoSave` (`hooks/use-debounced-auto-save.ts`) owns the whole
lifecycle: draft state, debounce, the in-flight guard against the debounce + blur
double-fire, `lastSavedRef` no-op skipping, Escape-to-revert, and the
failure-rollback + Sonner toast. The component renders the input and forwards
`onFocus`/`onBlur`. Example:
`components/character-sheet/editable-character-name.tsx`. No success indicator —
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

| Error code                                   | Surface                                                                                             |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| `invalid-input`                              | Toast — generic "Couldn't save". Programmer bug.                                                    |
| `entity-not-found` / `<aggregate>-not-found` | Toast — the row was deleted out from under the viewer. Usually a redirect to `/`.                   |
| `stale`                                      | Toast — "Someone else updated this — refresh to see the latest." Optimistic rollback.              |
| Domain engine error (e.g. `item-not-found`)  | Toast — domain-specific copy (rare; usually a bug, since the affordance shouldn't have rendered).   |

Auth-gate failures throw via Next's `forbidden()` and never return — the client
sees a 403, not an error code. Do not try to handle this in the UI: the affordance
shouldn't be visible to non-owners in the first place (`<OwnerOnly>` enforces
this), and a 403 from a tampered call is the correct outcome.
