"use server"

import { createDrizzleMutationAuthority } from "@workspace/headcanon/drizzle"
import {
  bindMutation,
  createNextMutationAction,
} from "@workspace/headcanon/next/server"

import {
  entityFinalize,
  entityIdentity,
  entityProtocol,
  entityWrite,
} from "@/domain/entity/commit/protocol"
import { requireActor, type Actor } from "@/lib/auth/actor"
import { getDb } from "@/lib/db/client"

import {
  entityFinalizeCommand,
  entityIdentityCommand,
  entityWriteCommand,
} from "./commands"
import {
  entityInvalidationPublisher,
  reportInvalidationFailure,
} from "./invalidations"

/** The app's complete server binding: definitions are registered once and the
 * package derives parsing, admission order, receipt execution, denial handling,
 * finalization, and same-ID projection recovery from this list. */
const executeEntityMutation = createNextMutationAction({
  protocol: entityProtocol,
  actor: requireActor,
  authority: createDrizzleMutationAuthority({
    db: getDb(),
    scope: (actor: Actor) => actor.userId,
  }),
  commands: [
    bindMutation(entityWrite, entityWriteCommand),
    bindMutation(entityIdentity, entityIdentityCommand),
    bindMutation(entityFinalize, entityFinalizeCommand),
  ],
  invalidations: entityInvalidationPublisher,
  reportInvalidationFailure,
})

export async function applyEntityMutationAction(envelope: unknown) {
  return executeEntityMutation(envelope)
}
