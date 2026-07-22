"use server"

import {
  createDrizzleMutationAuthority,
  matchesPostgresError,
} from "@workspace/headcanon/drizzle"
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

import { dungeonCommandHandler } from "./commands"

export const applyDungeonMutationAction = createNextMutationAction({
  protocol: dungeonProtocol,
  actor: requireActor,
  authority: createDrizzleMutationAuthority({
    db: getDb(),
    scope: (actor: Actor) => actor.userId,
    isContentionError: (error) =>
      matchesPostgresError(error, {
        code: "23505",
        constraint: "dungeon_one_active_per_campaign",
      }),
  }),
  commands: [bindMutation(dungeonCommand, dungeonCommandHandler)],
  invalidations: entityInvalidationPublisher,
  reportInvalidationFailure,
})
