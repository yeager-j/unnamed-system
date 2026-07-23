"use server"

import { createNextMutationAction } from "@workspace/headcanon/next/server"

import { entityProtocol } from "@/domain/entity/commit/protocol"
import { showtimeMutationEnvironment } from "@/lib/actions/mutations/environment"

import {
  entityFinalizeCommand,
  entityIdentityCommand,
  entityWriteCommand,
} from "./commands.definer.spike"

/**
 * UNN-688 spike, question 3 revisited: the apply twin over self-identifying
 * bindings — no `bindMutation` calls, no mutation-definition imports. Compare
 * with `apply.ts`. Delete or promote with the spike outcome.
 */
const executeEntityMutation = createNextMutationAction({
  ...showtimeMutationEnvironment(),
  protocol: entityProtocol,
  commands: [entityWriteCommand, entityIdentityCommand, entityFinalizeCommand],
})

export async function applyEntityMutationActionSpike(envelope: unknown) {
  return executeEntityMutation(envelope)
}
