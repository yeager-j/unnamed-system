import { z } from "zod/v4"

import type { EncounterState } from "@workspace/game-v2/encounter"
import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"
import { defineMutation, defineProtocol } from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

import { mergeComponentPatch } from "@/domain/entity/commit/merge-patch"
import { entityWriteRefusalSchema } from "@/domain/entity/commit/protocol"
import { combatEntityWriteSchema } from "@/domain/entity/commit/write.schema"
import {
  applyEntityWrite,
  type EntityWriteRefusal,
} from "@/domain/entity/commit/writers"

export const combatWriteArgs = z.object({
  encounterId: z.string().min(1),
  participantId: participantIdSchema,
  write: combatEntityWriteSchema,
})

export type CombatWriteArgs = z.infer<typeof combatWriteArgs>
export type CombatWriteRefusal = EntityWriteRefusal | "participant-not-found"

export function predictCombatWrite(
  state: EncounterState,
  { participantId, write }: Pick<CombatWriteArgs, "participantId" | "write">
): Result<EncounterState, CombatWriteRefusal> {
  const index = state.session.participants.findIndex(
    (participant) => participant.id === participantId
  )
  const participant = state.session.participants[index]
  if (!participant) return err("participant-not-found")

  const patch = applyEntityWrite(participant.entity.components, write)
  if (!patch.ok) return patch

  const participants = [...state.session.participants]
  participants[index] = {
    ...participant,
    entity: mergeComponentPatch(participant.entity, patch.value),
  }
  return ok({ ...state, session: { ...state.session, participants } })
}

export const combatWrite = defineMutation({
  name: "combat.write",
  args: combatWriteArgs,
  refusal: z.union([
    entityWriteRefusalSchema.exclude(["entity-load-failed"]),
    z.literal("participant-not-found"),
  ]),
  predict: predictCombatWrite,
})

export const combatEndArgs = z.object({
  encounterId: z.string().min(1),
})

export type CombatEndArgs = z.infer<typeof combatEndArgs>
export type CombatEndRefusal =
  | "encounter-not-live"
  | "map-instance-not-found"
  | "locator-missing"

export const combatEnd = defineMutation({
  name: "combat.end",
  args: combatEndArgs,
  refusal: z.enum([
    "encounter-not-live",
    "map-instance-not-found",
    "locator-missing",
  ]),
  predict: (state: EncounterState): Result<EncounterState, CombatEndRefusal> =>
    ok(state),
})

export const combatProtocol = defineProtocol({
  id: "showtime.combat.v1",
  mutations: [combatWrite, combatEnd],
})
