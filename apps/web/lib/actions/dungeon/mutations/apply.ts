"use server"

import { matchesPostgresError } from "@workspace/headcanon/drizzle"
import {
  bindMutation,
  createNextMutationAction,
} from "@workspace/headcanon/next/server"

import {
  dungeonCommand,
  dungeonProtocol,
} from "@/domain/dungeon/commit/protocol"
import { showtimeMutationEnvironment } from "@/lib/actions/mutations/environment"

import { dungeonCommandHandler } from "./commands"

export const applyDungeonMutationAction = createNextMutationAction({
  ...showtimeMutationEnvironment({
    isContentionError: (error) =>
      matchesPostgresError(error, {
        code: "23505",
        constraint: "dungeon_one_active_per_campaign",
      }),
  }),
  protocol: dungeonProtocol,
  commands: [bindMutation(dungeonCommand, dungeonCommandHandler)],
})
