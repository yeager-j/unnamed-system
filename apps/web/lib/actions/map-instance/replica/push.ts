"use server"

import { createMutationPushDoor } from "@workspace/replica/server"
import type { Result } from "@workspace/result"

import { authorizeCampaignDMForMapInstance } from "@/lib/auth/campaign-access"
import {
  publishDungeonInstancePing,
  publishEncounterInstancePing,
} from "@/lib/realtime/publish"

import { revalidateDungeon } from "../../dungeon/revalidate"
import { revalidateEncounter } from "../../encounter/revalidate"
import {
  createMapInstancePushProcessor,
  type MapInstancePushContext,
} from "./processor"
import {
  MapInstancePushSchema,
  type MapInstancePushError,
  type MapInstancePushInput,
} from "./wire.schema"

export async function pushMapInstanceMutationAction(
  input: MapInstancePushInput
): Promise<Result<void, MapInstancePushError>> {
  return pushMapInstanceMutation(input)
}

const pushMapInstanceMutation = createMutationPushDoor({
  schema: MapInstancePushSchema,
  invalidInput: "invalid-input" as const,
  async prepare({ mapInstanceId }): Promise<MapInstancePushContext> {
    return {
      mapInstanceId,
      authorization: await authorizeCampaignDMForMapInstance(mapInstanceId),
    }
  },
  createProcessor: ({ mapInstanceId }) =>
    createMapInstancePushProcessor(mapInstanceId),
  afterCommit({ version }, _parsed, context) {
    if (!context.authorization.ok) return
    for (const encounter of context.authorization.value.encounters) {
      publishEncounterInstancePing(encounter.shortId, version)
      revalidateEncounter(encounter)
    }
    for (const dungeon of context.authorization.value.dungeons) {
      publishDungeonInstancePing(dungeon.shortId, version)
      revalidateDungeon(dungeon)
    }
  },
})
