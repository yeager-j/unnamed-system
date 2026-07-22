"use server"

import { createDrizzleMutationAuthority } from "@workspace/headcanon/drizzle"
import {
  bindMutation,
  createNextMutationAction,
} from "@workspace/headcanon/next/server"

import {
  dungeonCommand,
  dungeonProtocol,
} from "@/domain/dungeon/commit/protocol"
import {
  entityInvalidationPublisher,
  reportInvalidationFailure,
} from "@/lib/actions/entity/mutations/invalidations"
import { requireActor, type Actor } from "@/lib/auth/actor"
import { getDb } from "@/lib/db/client"

import { dungeonCommandHandler, isDungeonActivationRace } from "./commands"

const executeDungeonMutation = createNextMutationAction({
  protocol: dungeonProtocol,
  actor: requireActor,
  authority: createDrizzleMutationAuthority({
    db: getDb(),
    scope: (actor: Actor) => actor.userId,
    isContentionError: isDungeonActivationRace,
  }),
  commands: [bindMutation(dungeonCommand, dungeonCommandHandler)],
  invalidations: entityInvalidationPublisher,
  reportInvalidationFailure,
})

export async function applyDungeonMutationAction(envelope: unknown) {
  return executeDungeonMutation(envelope)
}
