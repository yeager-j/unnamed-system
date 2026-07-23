"use server"

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
import { showtimeMutationEnvironment } from "@/lib/actions/mutations/environment"

import {
  combatEndCommand,
  combatEventCommand,
  combatWriteCommand,
} from "./commands"

export const applyCombatMutationAction = createNextMutationAction({
  ...showtimeMutationEnvironment(),
  protocol: combatProtocol,
  commands: [
    bindMutation(combatEvent, combatEventCommand),
    bindMutation(combatWrite, combatWriteCommand),
    bindMutation(combatEnd, combatEndCommand),
  ],
})
