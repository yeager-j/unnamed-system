# Server Actions — the owner-mode write pattern

Every write that mutates a character row in owner mode lives here. The shape
is non-negotiable: same plumbing, every file. Downstream tickets that need a
write surface should add to `lib/actions/` rather than inventing a new path
(API route, ad-hoc server function, etc.). If a use case doesn't fit, raise
it.

## The pattern

The Zod schema lives in `<domain>.schema.ts` alongside the action. A
`"use server"` module can only export async functions, so any client
component that wants to pre-validate (or any code outside the action that
references the input type) imports from the `.schema.ts` file directly.

Every owner-mode mutation carries the same envelope — the character id and the
per-write-class version token (UNN-140) — so it is not restated per file.
Extend the shared `characterMutationBase` (`./character-mutation.schema`) with
the domain payload instead (UNN-253):

```ts
// lib/actions/<domain>.schema.ts
import { z } from "zod/v4"

import { characterMutationBase } from "./character-mutation.schema"

export const SomeWriteSchema = characterMutationBase.extend({
  // ... the actual domain fields ...
})

export type SomeWriteInput = z.input<typeof SomeWriteSchema>
export type SomeWriteError = "invalid-input" | DbError
```

A write that takes no payload beyond the envelope is just
`export const SomeWriteSchema = characterMutationBase`.

```ts
// lib/actions/<domain>.ts
"use server"

import { requireOwner } from "@/lib/auth/viewer-role"
import { dbWrite } from "@/lib/db/<domain>"
import { type Result } from "@/lib/game/result"

import { revalidateCharacter } from "./revalidate"
import {
  SomeWriteSchema,
  type SomeWriteError,
  type SomeWriteInput,
} from "./<domain>.schema"

export async function someWriteAction(
  input: SomeWriteInput
): Promise<Result<SuccessValue, SomeWriteError>> {
  // 1. Parse input — never trust the wire.
  const parsed = SomeWriteSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  // 2. Authorize — the only sanctioned gate. Trips `forbidden()` (HTTP 403)
  //    on missing session, missing character, or wrong owner. Returns the
  //    loaded CharacterRow so we don't re-query.
  const character = await requireOwner(parsed.data.characterId)

  // 3. Persistence wrapper does the load → optional pure engine transition →
  //    conditional UPDATE (see Concurrency below).
  const result = await dbWrite(character.id, parsed.data, /* ... */)

  // 4. Revalidate the sheet route via the shared helper so derived stats
  //    (attributes, affinities, weapon attack roll, etc.) re-render with
  //    the new state.
  if (result.ok) revalidateCharacter(character)

  return result
}
```

## Concurrency

Every DB wrapper here is built on **per-write-class optimistic concurrency**
(UNN-140). One integer counter per write class lives on the `character` row —
`identityVersion`, `vitalsVersion`, `inventoryVersion`, `progressionVersion` —
and every owner write is gated on exactly one of them.

Which **edit surface** bumps which class is a deliberate, per-surface (not
per-table) decision. The single source of truth is the typed
`EDIT_SURFACE_CLASS` map in
[`lib/db/version-classes.ts`](../db/version-classes.ts): the client
(`useCharacterWrite({ surface })` / `useDebouncedAutoSave({ surface })`) resolves
the class from it, and every server wrapper passes `EDIT_SURFACE_CLASS.<surface>`
to `bumpCharacterVersionGuarded`, so the two layers are the same value and can't
silently disagree (UNN-233). The table below mirrors that map — keep them in sync:

| Write class | Edit surfaces | Notes |
|---|---|---|
| `identityVersion` | `name`, `pronouns`, `portrait`, `narrative`, `identityTraits`, `path`, `originArchetype`, `activeArchetype`, `inheritanceSlots`, `builderStep`, `knives`, `chains`, `talents`, `virtuesAllocation`, `finalize` | Creation-time + stable-identity edits. `virtuesAllocation` is the builder's rulebook-1.2 allocation — distinct from `virtueRankUp` below. |
| `vitalsVersion` | `pools`, `cast`, `ailments`, `battleConditions`, `exhaustion`, `prisma`, `clearCombatState`, `rest`, `mechanic` | In-play Combat-tab state. |
| `inventoryVersion` | `inventoryItems`, `currency` | **`currency` rides here despite being a `characters` column** — the wallet lives on the Inventory tab, so it shares the class for optimistic-frame coherence (UNN-223). The canonical per-surface-not-per-table case. |
| `progressionVersion` | `victories`, `virtueRankUp`, `spark` | Sheet-side Virtue rank-up / Spark — progression, unlike the builder's identity-class `virtuesAllocation`. |
| `progressionVersion` + `vitalsVersion` | `levelUp` | The one **cross-class** write — gated on both tokens and bumps both, so it carries an `expectedVersions` pair and is *not* in `EDIT_SURFACE_CLASS`. See `leveling.applyLevelUp`. |

The shape of every wrapper:

- Conditions the `UPDATE` on `WHERE id = ? AND <class>Version = ?`.
- Increments `<class>Version` atomically in the same `SET` clause
  (`sql\`${characters.<class>Version} + 1\``).
- Returns `Result.err("stale")` when the row count is zero (and
  `"character-not-found"` if the row was deleted, disambiguated by a
  follow-up `characterExists` check).
- Returns the new `version` in the success value so the client can chain
  follow-up saves without a re-fetch.
- Cross-class writes (currently only `leveling.applyLevelUp`, which touches
  vitals + progression) condition on *both* expected versions and bump both.

Per-class scoping is the load-bearing property: a debounced notes save in
flight does not get falsely staled by a blur on an unrelated vitals counter.
Two writes in the *same* class still race (correctly — that's the point).

Child-table writes (e.g. inventory items) run inside a `db.transaction` and
bump `<class>Version` conditionally **first**, so the row lock either blocks
a concurrent writer or causes the conditional `WHERE` to miss with no child
rows touched.

The `"stale"` error code is the consumer-facing seam; swapping the
underlying strategy later (serializable transactions, automatic refetch +
retry, finer per-class partitioning) won't touch action call sites.

`characters.updatedAt` is still on the row as a "last touched" display
column but is no longer the concurrency token.

## Mechanic writes — a specialization where the DB wrapper layer collapses

Per-Archetype mechanic writes (UNN-227+, e.g. Valor, Perfection) share a
single persistence primitive: [lib/db/writes/mechanic-state.ts](../db/writes/mechanic-state.ts)
exports `applyMechanicStateForCharacter<K>(characterId, kind, transition, expectedVersion)`,
which runs the whole transaction (load the active `characterArchetype`,
validate kind, run the pure transition, conditional `vitalsVersion` bump,
write `mechanicState` back).

Because that primitive owns the entire persistence step, the per-mechanic
DB wrapper file has nothing left to do — it would be a typed alias around
a one-line composition. So mechanic actions skip the DB wrapper layer
entirely and compose the pure transition inline:

```ts
// lib/actions/mechanics/knight/valor.ts
const delta = parsed.data.direction === "increment" ? 1 : -1
const result = await applyMechanicStateForCharacter(
  character.id, "valor",
  (state) => adjustValor(state, delta),
  parsed.data.expectedVersion,
)
```

The pure transition (`adjustValor`, `resetPerfection`, …) lives next to
the `MechanicDefinition` in `lib/game/mechanics/<lineage>/<kind>.ts`,
where the game-layer tests already exercise it. Adding a new mechanic
write surface is therefore: pure transition (game/), action + schema
(actions/mechanics/), UI control (components/character-sheet/mechanics/).
Three files, no DB layer.

**This collapse only applies when the shared primitive owns everything.**
The general 3-layer pattern below still holds for writes with per-domain
logic — `adjust-pools`, `combat-state`, `inventory`, `rest`, `leveling`
all have meaningful DB wrappers because they coordinate across columns
(or child tables), run engine validation, or compose engine transitions
that aren't expressible as a single transition function. Earn the layer
by needing it; don't add one for symmetry.

## Client patterns

Two shapes prove the pattern (UNN-180):

### 1. Debounced auto-save on a free-text field

Use `useDebouncedAutoSave` (`hooks/use-debounced-auto-save.ts`). It owns
the whole lifecycle: draft state, debounce, in-flight guard against the
debounce + blur double-fire, `lastSavedRef` for skipping no-op edits,
`updatedAtRef` with the prop-sync + on-success dual-writer, Escape-to-
revert, and the failure-rollback + Sonner toast. The component just
renders the input and forwards `onFocus`/`onBlur` so the hook knows when
to pause draft-from-prop sync.

Example: `components/character-sheet/editable-character-name.tsx`.

No success indicator: the typed value staying in the input is the
confirmation, and a routine-save channel that stays quiet means a real
error reads as one.

### 2. Optimistic toggle on a click action
`components/character-sheet/inventory.tsx`

The user clicks Equip / Unequip. The parent component's `useOptimistic`
applies the change via the **same pure engine** (`equipItem` / `unequipItem`)
the server uses, so the optimistic frame is structurally identical to what
the server will persist — no risk of drift. After the Server Action returns,
`revalidatePath` re-derives every dependent stat (attributes, affinities,
weapon attack roll). Failures toast via Sonner; React reverts the optimistic
state automatically when the transition resolves.

## Failure modes the UI must handle

| Error code              | Surface                                          |
|-------------------------|--------------------------------------------------|
| `invalid-input`         | Toast — generic "Couldn't save". Programmer bug. |
| `character-not-found`   | Toast — the character was deleted out from under |
|                         | the viewer. Usually means redirect to `/`.       |
| `stale`                 | Toast — "Someone else updated this character —   |
|                         | refresh to see the latest." Optimistic rollback. |
| Domain engine error     | Toast — domain-specific copy (rare; usually a    |
| (e.g. `item-not-found`) | bug, since the affordance shouldn't have been    |
|                         | rendered).                                       |

`requireOwner` failures throw via Next's `forbidden()` and never return — the
client sees a 403, not an error code. Do not try to handle this in the UI;
the affordance shouldn't be visible to non-owners in the first place
(`<OwnerOnly>` enforces this), and a 403 from a tampered call is the correct
outcome.
