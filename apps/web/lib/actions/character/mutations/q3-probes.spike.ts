import "server-only"

import type { DrizzleMutationTx } from "@workspace/headcanon/drizzle"
import { createMutationCommandDefiner } from "@workspace/headcanon/next/server"

import { characterIdentityWrite } from "@/domain/character/commit/protocol"
import type { Actor } from "@/lib/auth/actor"
import type { getDb } from "@/lib/db/client"

import { entityWriteCommand } from "./commands.definer.spike"

// Re-created rather than imported from the commands twin: exporting the
// definer value trips TS2883 (its inferred type references the package's
// unexported `AnyMutationDefinition`), so adopting the definer would require
// the package to export a nameable `MutationCommandDefiner` type. Recorded as
// an adoption cost.
const defineEntityMutationCommand = createMutationCommandDefiner<
  Actor,
  ReturnType<typeof getDb>,
  DrizzleMutationTx<ReturnType<typeof getDb>>
>()

/**
 * UNN-688 spike, question 3 revisited: recorded probe results for the
 * definer-scoped command factory (see `commands.definer.spike.ts`).
 *
 * **Probe A — member-order sensitivity (FAILED, recorded 2026-07-22).**
 * Listing `execute` before `admit` in the command literal collapses the
 * inferred `Evidence` to `unknown`: TypeScript fixes type parameters while
 * processing context-sensitive members top-to-bottom, so an inference source
 * must precede its use. The error surfaces as
 * `Argument of type 'unknown' is not assignable to parameter of type
 * 'AdmittedEntityWrite'` at the `evidence` use site, with no hint that member
 * order is the cause. The lifecycle order (screen → admit → execute →
 * finalizeAccepted) is the natural one, but nothing enforces it.
 *
 * **Probe B — error localization (degraded, recorded 2026-07-22).**
 * With `screen` projecting `{ shortId: 123 }` (number) and `finalizeAccepted`
 * consuming it as a string, the error lands at the consumer inside
 * `finalizeAccepted`, not at `screen`'s wrong return. Today's
 * `satisfies EntityMutationCommand<..., Projection, Evidence>` form errors at
 * the declaration instead, because Projection is stated rather than inferred.
 */

// The load-bearing negative typecheck survives the definer: a command written
// for one definition cannot be re-bound to another.
export const q3WrongPairing = defineEntityMutationCommand(
  characterIdentityWrite,
  // @ts-expect-error — characterEntityWrite's command does not fit characterIdentityWrite.
  entityWriteCommand.command
)
