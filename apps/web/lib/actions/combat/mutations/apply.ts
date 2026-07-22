"use server"

import { createDrizzleMutationAuthority } from "@workspace/headcanon/drizzle"
import {
  bindMutation,
  createNextMutationAction,
} from "@workspace/headcanon/next/server"

import {
  combatEnd,
  combatEvent,
  combatProtocol,
  combatWrite,
} from "@/domain/combat/commit/protocol"
import {
  entityInvalidationPublisher,
  reportInvalidationFailure,
} from "@/lib/actions/entity/mutations/invalidations"
import { requireActor, type Actor } from "@/lib/auth/actor"
import { getDb } from "@/lib/db/client"

import {
  combatEndCommand,
  combatEventCommand,
  combatWriteCommand,
} from "./commands"

export const applyCombatMutationAction = createNextMutationAction({
  protocol: combatProtocol,
  actor: requireActor,
  authority: createDrizzleMutationAuthority({
    db: getDb(),
    scope: (actor: Actor) => actor.userId,
  }),
  commands: [
    bindMutation(combatEvent, combatEventCommand),
    bindMutation(combatWrite, combatWriteCommand),
    bindMutation(combatEnd, combatEndCommand),
  ],
  invalidations: entityInvalidationPublisher,
  reportInvalidationFailure,
})
