"use server"

import { createDrizzleMutationAuthority } from "@workspace/headcanon/drizzle"
import {
  bindMutation,
  createNextMutationAction,
} from "@workspace/headcanon/next/server"

import {
  mapGeometryEvents,
  mapProtocol,
  mapRename,
} from "@/domain/map/commit/protocol"
import {
  entityInvalidationPublisher,
  reportInvalidationFailure,
} from "@/lib/actions/entity/mutations/invalidations"
import { requireActor, type Actor } from "@/lib/auth/actor"
import { getDb } from "@/lib/db/client"

import { mapGeometryEventsCommand, mapRenameCommand } from "./commands"

export const applyMapMutationAction = createNextMutationAction({
  protocol: mapProtocol,
  actor: requireActor,
  authority: createDrizzleMutationAuthority({
    db: getDb(),
    scope: (actor: Actor) => actor.userId,
  }),
  commands: [
    bindMutation(mapRename, mapRenameCommand),
    bindMutation(mapGeometryEvents, mapGeometryEventsCommand),
  ],
  invalidations: entityInvalidationPublisher,
  reportInvalidationFailure,
})
