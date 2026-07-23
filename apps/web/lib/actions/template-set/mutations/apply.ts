"use server"

import {
  bindMutation,
  createNextMutationAction,
} from "@workspace/headcanon/next/server"

import {
  templateSetEvents,
  templateSetProtocol,
  templateSetRename,
} from "@/domain/template-set/commit/protocol"
import { showtimeMutationEnvironment } from "@/lib/actions/mutations/environment"

import { templateSetEventsCommand, templateSetRenameCommand } from "./commands"

export const applyTemplateSetMutationAction = createNextMutationAction({
  ...showtimeMutationEnvironment(),
  protocol: templateSetProtocol,
  commands: [
    bindMutation(templateSetRename, templateSetRenameCommand),
    bindMutation(templateSetEvents, templateSetEventsCommand),
  ],
})
