"use server"

import {
  bindMutation,
  createNextMutationAction,
} from "@workspace/headcanon/next/server"

import {
  characterEntityWrite,
  characterFinalize,
  characterIdentityWrite,
  characterProtocol,
} from "@/domain/character/commit/protocol"
import { showtimeMutationEnvironment } from "@/lib/actions/mutations/environment"

import {
  entityFinalizeCommand,
  entityIdentityCommand,
  entityWriteCommand,
} from "./commands"

/** The app's complete server binding: definitions are registered once and the
 * package derives parsing, admission order, receipt execution, denial handling,
 * finalization, and same-ID projection recovery from this list. */
export const applyCharacterMutationAction = createNextMutationAction({
  ...showtimeMutationEnvironment(),
  protocol: characterProtocol,
  commands: [
    bindMutation(characterEntityWrite, entityWriteCommand),
    bindMutation(characterIdentityWrite, entityIdentityCommand),
    bindMutation(characterFinalize, entityFinalizeCommand),
  ],
})
