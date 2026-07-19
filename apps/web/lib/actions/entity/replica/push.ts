"use server"

import { createMutationPushDoor } from "@workspace/replica/server"
import { err, type Result } from "@workspace/result"

import { ENTITY_WRITERS } from "@/domain/entity/commit/writers"
import { entityReplicaMutations } from "@/domain/entity/replica/mutations"
import type { EntityReplicaRejection } from "@/domain/entity/replica/rejection"
import { authorizeEntityWriteForClass } from "@/lib/auth/campaign-access"
import type { LoadedPlayerCharacter } from "@/lib/db/queries/load-player-character"
import { publishCharacterPing } from "@/lib/realtime/publish"

import { checkArchetypeUnlockGates } from "../archetype-unlock-gate"
import { revalidateCharacterList, revalidateEntity } from "../revalidate"
import { createEntityPushProcessor, type EntityPushContext } from "./processor"
import {
  EntityPushSchema,
  type EntityPushError,
  type EntityPushInput,
} from "./wire.schema"

/**
 * The replica push door (UNN-645/648): one delivery of a registered entity
 * mutation envelope. Parse the transport shape, compute the viewer's authorization
 * verdict outside the transaction, then hand the envelope to the processor —
 * which owns ordering, dedup, the recorded outcome, and the atomic domain
 * write. Unlike every other action in `lib/actions`, an auth refusal here is
 * a **typed rejection**, not a `forbidden()` throw: the refusal must be
 * recorded against the client's watermark, or the client's ordered queue
 * wedges into a gap on its next mutation.
 *
 * On an actually-executed commit (never a deduplicated replay — the
 * processor's context back-channel distinguishes them) it fires the character
 * realtime ping plus route revalidation. Owner mounts ingest the ping through
 * their replica; read-only and classic combat readers retain their respective
 * RSC/token catch-up paths.
 */
export async function pushEntityMutationAction(
  input: EntityPushInput
): Promise<Result<void, EntityPushError>> {
  return pushEntityMutation(input)
}

const pushEntityMutation = createMutationPushDoor({
  schema: EntityPushSchema,
  invalidInput: "invalid-input" as const,
  async prepare({ entityId, envelope }): Promise<EntityPushContext> {
    return {
      entityId,
      authorization: await authorizeEnvelope(entityId, envelope.invocation),
    }
  },
  createProcessor: ({ entityId }) => createEntityPushProcessor(entityId),
  afterCommit({ shortId, durableClass, version, revalidateList }) {
    publishCharacterPing(shortId, "entity", { [durableClass]: version })
    revalidateEntity({ shortId })
    if (revalidateList) revalidateCharacterList()
  },
})

/**
 * The viewer's verdict for this delivery, computed before the transaction:
 * the class → posture gate plus the archetype unlock gates, all Result-shaped
 * so the processor can record a refusal. When the args don't parse, the
 * verdict is moot — the processor's decode fails first and records `invalid`;
 * the `forbidden` here is the fail-closed default for that unreachable arm.
 */
async function authorizeEnvelope(
  entityId: string,
  invocation: { readonly name: string; readonly args: unknown }
): Promise<Result<LoadedPlayerCharacter, EntityReplicaRejection>> {
  const decoded = entityReplicaMutations.decode(invocation)
  if (!decoded.ok) return err("forbidden")

  if (decoded.value.name === "entity.setColumn") {
    return authorizeEntityWriteForClass(entityId, "identity")
  }

  const write = decoded.value.args
  const { durableClass } = ENTITY_WRITERS[write.component]
  const authorized = await authorizeEntityWriteForClass(entityId, durableClass)
  if (!authorized.ok) return authorized

  const gated = await checkArchetypeUnlockGates(entityId, write)
  if (!gated.ok) return err("forbidden")

  return authorized
}
