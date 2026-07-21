import {
  entityWriteArgs,
  type EntityWriteArgs,
} from "@/domain/entity/commit/protocol"
import { ENTITY_WRITERS } from "@/domain/entity/commit/writers"
import {
  requireEntityOwner,
  requireOwnerOrCampaignDMForEntity,
} from "@/lib/auth/campaign-access"

import { refuseGatedArchetypeSpend } from "../archetype-gate"

/**
 * The Headcanon door's authorization (UNN-673, AC #5): the door owns auth, so the
 * handler stays a pure transaction body. Same posture as the legacy Store — a
 * `vitals`-class write admits the owner *or* the campaign DM (the console's
 * sanctioned HP/SP access); every other class is strict-owner, so a DM cannot
 * rewrite a placed player's Origin, Virtues, or narrative through this door — plus
 * the shared restricted-Archetype / narrative-lock gate. Every gate trips
 * `forbidden()` on failure. The write class is derived from the Writer registry,
 * never taken from the wire.
 */
export async function authorizeEntityWrite({
  entityId,
  write,
}: EntityWriteArgs): Promise<void> {
  const { durableClass } = ENTITY_WRITERS[write.component]
  if (durableClass === "vitals") {
    await requireOwnerOrCampaignDMForEntity(entityId)
  } else {
    await requireEntityOwner(entityId)
  }

  await refuseGatedArchetypeSpend(entityId, write)
}

/**
 * Extracts the `entity.write` target from an untrusted envelope using the exact
 * argument schema the executor admits with, or `null` when the envelope is not a
 * valid `entity.write`. A `null` target means the executor will reject the
 * envelope before any handler runs, so skipping authorization for it writes
 * nothing; a non-null target is authorized before execution. The two parsers are
 * the same schema, so no valid write can slip past the gate.
 */
export function parseEntityWriteTarget(
  envelope: unknown
): EntityWriteArgs | null {
  if (typeof envelope !== "object" || envelope === null) return null
  const invocation = (envelope as { invocation?: unknown }).invocation
  if (typeof invocation !== "object" || invocation === null) return null

  const parsed = entityWriteArgs.safeParse(
    (invocation as { args?: unknown }).args
  )
  return parsed.success ? parsed.data : null
}
