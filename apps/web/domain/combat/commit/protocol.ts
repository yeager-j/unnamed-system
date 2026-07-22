import { z } from "zod/v4"

import {
  addParticipantPaired,
  combatEventSchema,
  createReduceEncounter,
  removeParticipantPaired,
  storedEntitySchema,
  type CombatEvent,
  type EncounterState,
} from "@workspace/game-v2/encounter"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import { participantIdSchema } from "@workspace/game-v2/kernel/participant-id.schema"
import { COMBAT_SIDES } from "@workspace/game-v2/kernel/vocab/combat"
import {
  mapInstanceEventSchema,
  type MapInstanceEvent,
} from "@workspace/game-v2/spatial"
import {
  defineMutation,
  defineProtocol,
  type MutationContext,
} from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

import { mergeComponentPatch } from "@/domain/entity/commit/merge-patch"
import { entityWriteRefusalSchema } from "@/domain/entity/commit/protocol"
import { combatEntityWriteSchema } from "@/domain/entity/commit/write.schema"
import {
  applyEntityWrite,
  type EntityWriteRefusal,
} from "@/domain/entity/commit/writers"

const addParticipantSetupBase = z.object({
  id: participantIdSchema,
  side: z.enum(COMBAT_SIDES),
  zoneId: z.string().min(1).optional(),
})

const addParticipantEventSchema = z.object({
  kind: z.literal("addParticipant"),
  setup: z.union([
    addParticipantSetupBase.extend({
      entity: storedEntitySchema.transform((entity) => entity as Entity),
    }),
    addParticipantSetupBase.extend({ entityId: z.string().min(1) }),
  ]),
})

const nonAddCombatEventSchema = combatEventSchema
  .refine(
    (event): event is Exclude<CombatEvent, { kind: "addParticipant" }> =>
      event.kind !== "addParticipant"
  )
  .transform(
    (event) => event as Exclude<CombatEvent, { kind: "addParticipant" }>
  )

export const consoleCombatEventSchema = z.union([
  addParticipantEventSchema,
  nonAddCombatEventSchema,
  mapInstanceEventSchema,
])

export type ConsoleCombatEvent = z.infer<typeof consoleCombatEventSchema>

export const combatEventArgs = z.object({
  encounterId: z.string().min(1),
  event: consoleCombatEventSchema,
})

export type CombatEventArgs = z.infer<typeof combatEventArgs>
export type CombatEventRefusal =
  | "campaign-already-has-live-encounter"
  | "encounter-has-unplaced-combatants"
  | "character-not-found"
  | "invalid-entity"
  | "locator-missing"
  | "map-instance-not-found"

/** Stable reducer ids derived from Headcanon's identity for one invocation. */
export function createCombatEventIdFactory(mutationId: string): () => string {
  let index = 0
  return () => `${mutationId}:${index++}`
}

function isMapInstanceEvent(
  event: ConsoleCombatEvent
): event is MapInstanceEvent {
  return mapInstanceEventSchema.safeParse(event).success
}

export function predictCombatEvent(
  state: EncounterState,
  { event }: Pick<CombatEventArgs, "event">,
  { mutationId }: MutationContext
): Result<EncounterState, CombatEventRefusal> {
  const newId = createCombatEventIdFactory(mutationId)

  if (isMapInstanceEvent(event)) {
    return ok(createReduceEncounter(newId)(state, event))
  }

  if (event.kind === "addParticipant") {
    if ("entityId" in event.setup) return ok(state)
    return ok(
      addParticipantPaired(newId)(
        state,
        {
          kind: "addParticipant",
          setup: {
            id: event.setup.id,
            side: event.setup.side,
            entity: event.setup.entity,
          },
        },
        event.setup.zoneId
      )
    )
  }

  if (event.kind === "removeParticipant") {
    return ok(removeParticipantPaired(newId)(state, event))
  }

  return ok(createReduceEncounter(newId)(state, event as CombatEvent))
}

export const combatEvent = defineMutation({
  name: "combat.event",
  args: combatEventArgs,
  refusal: z.enum([
    "campaign-already-has-live-encounter",
    "encounter-has-unplaced-combatants",
    "character-not-found",
    "invalid-entity",
    "locator-missing",
    "map-instance-not-found",
  ]),
  predict: predictCombatEvent,
})

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
  mutations: [combatEvent, combatWrite, combatEnd],
})
