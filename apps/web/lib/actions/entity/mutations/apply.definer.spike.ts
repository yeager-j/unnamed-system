"use server"

import { createDrizzleMutationAuthority } from "@workspace/headcanon/drizzle"
import { createNextMutationAction } from "@workspace/headcanon/next/server"

import { entityProtocol } from "@/domain/entity/commit/protocol"
import { requireActor, type Actor } from "@/lib/auth/actor"
import { getDb } from "@/lib/db/client"

import {
  entityFinalizeCommand,
  entityIdentityCommand,
  entityWriteCommand,
} from "./commands.definer.spike"
import {
  entityInvalidationPublisher,
  reportInvalidationFailure,
} from "./invalidations"

/**
 * UNN-688 spike, question 3 revisited: the apply twin over self-identifying
 * bindings — no `bindMutation` calls, no mutation-definition imports. Compare
 * with `apply.ts`. Delete or promote with the spike outcome.
 */
const executeEntityMutation = createNextMutationAction({
  protocol: entityProtocol,
  actor: requireActor,
  authority: createDrizzleMutationAuthority({
    db: getDb(),
    scope: (actor: Actor) => actor.userId,
  }),
  commands: [entityWriteCommand, entityIdentityCommand, entityFinalizeCommand],
  invalidations: entityInvalidationPublisher,
  reportInvalidationFailure,
})

export async function applyEntityMutationActionSpike(envelope: unknown) {
  return executeEntityMutation(envelope)
}
