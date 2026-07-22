"use server"

import { createDrizzleMutationAuthority } from "@workspace/headcanon/drizzle"
import {
  bindMutation,
  createNextMutationAction,
} from "@workspace/headcanon/next/server"

import { combatProtocol, combatWrite } from "@/domain/combat/commit/protocol"
import {
  entityInvalidationPublisher,
  reportInvalidationFailure,
} from "@/lib/actions/entity/mutations/invalidations"
import { requireActor, type Actor } from "@/lib/auth/actor"
import { getDb } from "@/lib/db/client"

import { combatWriteCommand } from "./commands"

const executeCombatMutation = createNextMutationAction({
  protocol: combatProtocol,
  actor: requireActor,
  authority: createDrizzleMutationAuthority({
    db: getDb(),
    scope: (actor: Actor) => actor.userId,
  }),
  commands: [bindMutation(combatWrite, combatWriteCommand)],
  invalidations: entityInvalidationPublisher,
  reportInvalidationFailure,
})

export async function applyCombatMutationAction(envelope: unknown) {
  return executeCombatMutation(envelope)
}
