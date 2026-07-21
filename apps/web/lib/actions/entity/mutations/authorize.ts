import {
  entityWrite,
  entityWriteArgs,
  type EntityWriteArgs,
} from "@/domain/entity/commit/protocol"

/**
 * Extracts the `entity.write` target from an untrusted envelope using the exact
 * argument schema the executor admits with, or `null` when the envelope is not a
 * valid `entity.write`. A `null` target means the executor will reject the
 * envelope before any handler runs, so skipping the door's authorization
 * pre-check for it writes nothing; a non-null target is pre-authorized before
 * execution. The two parsers are the same schema, so no valid write can slip past
 * the gate.
 *
 * The authorization *rule* lives in `authorize-write.ts` (UNN-674) — the handler
 * reruns it inside the transaction and the door pre-checks it via
 * `requireEntityWriteAuthorized`; this module only lifts the target out of the
 * envelope for that pre-check.
 *
 * Since the protocol registered a second mutation (UNN-675) the invocation **name**
 * is the discriminant, not the args shape: `entity.identity` has its own door and
 * its own gate, and inferring "is this an `entity.write`?" from a structural parse
 * alone would be one coincidence away from wrong.
 */
export function parseEntityWriteTarget(
  envelope: unknown
): EntityWriteArgs | null {
  if (typeof envelope !== "object" || envelope === null) return null
  const invocation = (envelope as { invocation?: unknown }).invocation
  if (typeof invocation !== "object" || invocation === null) return null
  if ((invocation as { name?: unknown }).name !== entityWrite.name) return null

  const parsed = entityWriteArgs.safeParse(
    (invocation as { args?: unknown }).args
  )
  return parsed.success ? parsed.data : null
}
