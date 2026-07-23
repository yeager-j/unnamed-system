"use server"

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
import { showtimeMutationEnvironment } from "@/lib/actions/mutations/environment"

import {
  entityFinalizeCommand,
  entityIdentityCommand,
  entityWriteCommand,
} from "./commands"

/** The app's complete server binding: definitions are registered once and the
 * package derives parsing, admission order, receipt execution, denial handling,
 * finalization, and same-ID projection recovery from this list. */
export const applyEntityMutationAction = createNextMutationAction({
  ...showtimeMutationEnvironment(),
  protocol: entityProtocol,
  commands: [
    bindMutation(entityWrite, entityWriteCommand),
    bindMutation(entityIdentity, entityIdentityCommand),
    bindMutation(entityFinalize, entityFinalizeCommand),
  ],
})
