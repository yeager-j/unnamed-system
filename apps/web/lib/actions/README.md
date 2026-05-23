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

```ts
// lib/actions/<domain>.schema.ts
import { z } from "zod/v4"

export const SomeWriteSchema = z.object({
  characterId: z.string().min(1),
  // ... the actual fields ...
  expectedUpdatedAt: z.coerce.date(), // the optimistic-concurrency token
})

export type SomeWriteInput = z.input<typeof SomeWriteSchema>
export type SomeWriteError = "invalid-input" | DbError
```

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

Every DB wrapper here is built on **optimistic concurrency via
`characters.updatedAt`**:

- The Drizzle schema column carries `$onUpdate(() => new Date())` so an
  `UPDATE` automatically bumps the timestamp.
- Every write conditions on `WHERE id = ? AND "updatedAt" = ?` and returns
  `Result.err("stale")` when the row count is zero.
- The client tracks the last-known `updatedAt` (returned in every success
  result) and passes it back as `expectedUpdatedAt` on the next save.
- Child-table writes (e.g. inventory items) run inside a `db.transaction` and
  bump `characters.updatedAt` conditionally **first**, so the row lock either
  blocks a concurrent writer or causes the conditional `WHERE` to miss with no
  child rows touched.

**This is the UNN-180 baseline, not the final word.** UNN-140 owns the
cross-cutting concurrency policy and may replace this strategy (numeric
version counters, serializable transactions, automatic refetch + retry, etc.)
across every wrapper. The `"stale"` error code is the contract that lets it.

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
