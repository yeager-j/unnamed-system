"use server"

import { createDrizzleMutationAuthority } from "@workspace/headcanon/drizzle"
import {
  bindMutation,
  createNextMutationAction,
} from "@workspace/headcanon/next/server"

import {
  templateSetEvents,
  templateSetProtocol,
  templateSetRename,
} from "@/domain/template-set/commit/protocol"
import {
  entityInvalidationPublisher,
  reportInvalidationFailure,
} from "@/lib/actions/entity/mutations/invalidations"
import { requireActor, type Actor } from "@/lib/auth/actor"
import { getDb } from "@/lib/db/client"

import { templateSetEventsCommand, templateSetRenameCommand } from "./commands"

export const applyTemplateSetMutationAction = createNextMutationAction({
  protocol: templateSetProtocol,
  actor: requireActor,
  authority: createDrizzleMutationAuthority({
    db: getDb(),
    scope: (actor: Actor) => actor.userId,
  }),
  commands: [
    bindMutation(templateSetRename, templateSetRenameCommand),
    bindMutation(templateSetEvents, templateSetEventsCommand),
  ],
  invalidations: entityInvalidationPublisher,
  reportInvalidationFailure,
})
