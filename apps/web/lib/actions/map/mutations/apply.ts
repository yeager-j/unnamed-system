"use server"

import {
  bindMutation,
  createNextMutationAction,
} from "@workspace/headcanon/next/server"

import {
  mapGeometryEvents,
  mapProtocol,
  mapRename,
} from "@/domain/map/commit/protocol"
import { showtimeMutationEnvironment } from "@/lib/actions/mutations/environment"

import { mapGeometryEventsCommand, mapRenameCommand } from "./commands"

export const applyMapMutationAction = createNextMutationAction({
  ...showtimeMutationEnvironment(),
  protocol: mapProtocol,
  commands: [
    bindMutation(mapRename, mapRenameCommand),
    bindMutation(mapGeometryEvents, mapGeometryEventsCommand),
  ],
})
