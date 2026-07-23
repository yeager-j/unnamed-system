import { z } from "zod/v4"

import {
  COMBAT_ADVANTAGES,
  COMBAT_SIDES,
} from "@workspace/game-v2/kernel/vocab/combat"
import {
  reduceMapInstance as createReduceMapInstance,
  dungeonEventSchema,
  GENERATION_DUNGEON_EVENT_KINDS,
  GENERATION_INSTANCE_EVENT_KINDS,
  mapInstanceEventSchema,
  reduceDungeon,
  type DungeonEvent,
  type DungeonState,
  type MapInstanceEvent,
  type MapInstanceState,
} from "@workspace/game-v2/spatial"
import { defineMutation, defineProtocol } from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

export interface DungeonCanonValue {
  dungeon: DungeonState
  instance: MapInstanceState
}

export const MAX_STAGED_ENEMY_COUNT = 20

const placementSchema = z.object({
  characterId: z.string().min(1),
  zoneId: z.string().min(1),
})

const revealEventSchema = mapInstanceEventSchema.refine(
  (event) =>
    (
      [
        "revealZone",
        "revealConnection",
        "unlockConnection",
      ] as readonly string[]
    ).includes(event.kind),
  { message: "event must be a reveal-overlay event" }
)

const dungeonCommandSchema = z.discriminatedUnion("kind", [
  z.object({
    kind: z.literal("event"),
    event: z.union([dungeonEventSchema, mapInstanceEventSchema]),
  }),
  z.object({
    kind: z.literal("searchReveal"),
    characterId: z.string().min(1),
    event: revealEventSchema,
  }),
  z.object({
    kind: z.literal("start"),
    placements: z.array(placementSchema),
  }),
  z.object({ kind: z.literal("finish") }),
  // The expand gesture (UNN-642, D8 seam 2): the one non-optimistic spatial
  // write. `forcedTemplateKey` is the DM's force-pick — same kind, same
  // executor, same engine emitter, so random and forced cannot diverge.
  z.object({
    kind: z.literal("expandStub"),
    stubId: z.string().min(1),
    forcedTemplateKey: z.string().min(1).optional(),
  }),
  z.object({
    kind: z.literal("retractZone"),
    zoneId: z.string().min(1),
  }),
  z.object({
    kind: z.literal("startEncounter"),
    name: z.string().trim().min(1).max(100),
    advantage: z.enum(COMBAT_ADVANTAGES),
    firstSide: z.enum(COMBAT_SIDES),
    partyCharacterIds: z.array(z.string().min(1)),
    enemies: z.array(
      z.object({
        enemyKey: z.string().min(1),
        zoneId: z.string().min(1),
        count: z.number().int().min(1).max(MAX_STAGED_ENEMY_COUNT),
      })
    ),
  }),
])

export const dungeonCommandArgs = z.object({
  dungeonId: z.string().min(1),
  command: dungeonCommandSchema,
})

export type DungeonCommandArgs = z.infer<typeof dungeonCommandArgs>
export type DungeonCommand = DungeonCommandArgs["command"]

export const dungeonCommandRefusalSchema = z.enum([
  "campaign-already-has-active-delve",
  "campaign-already-has-live-encounter",
  "character-not-found",
  "character-not-in-campaign",
  "delve-has-live-encounter",
  "delve-not-active",
  "delve-not-draft",
  "encounter-has-unplaced-combatants",
  // Defensive: the roller failed for a reason no precondition names (corrupt
  // state) — deliberately generic, never the benign consumed-stub case.
  "expansion-failed",
  // The forced pick was unknown, tombstoned, or a spent unique.
  "forced-template-not-mintable",
  "generation-event-not-supported",
  "locator-missing",
  "map-instance-not-found",
  "map-not-found",
  "not-an-expedition",
  "region-not-found",
  // Five distinct retract refusals, not one: each names a different next
  // action for the DM (finish combat / move the party / hide the zone /
  // retract deeper rooms first), and the toast table keys per-cause copy.
  "retract-zone-in-encounter",
  "retract-zone-not-generated",
  "retract-zone-not-leaf",
  "retract-zone-occupied",
  "retract-zone-revealed",
  "template-set-not-found",
  "unknown-enemy",
])

export type DungeonCommandRefusal = z.infer<typeof dungeonCommandRefusalSchema>

const generationEventKinds: ReadonlySet<string> = new Set([
  ...GENERATION_INSTANCE_EVENT_KINDS,
  ...GENERATION_DUNGEON_EVENT_KINDS,
])

export function isGenerationDungeonCommandEvent(
  event: DungeonEvent | MapInstanceEvent
): boolean {
  return generationEventKinds.has(event.kind)
}

export function isDungeonEvent(
  event: DungeonEvent | MapInstanceEvent
): event is DungeonEvent {
  return dungeonEventSchema.safeParse(event).success
}

export function predictDungeonCommand(
  state: DungeonCanonValue,
  { command }: Pick<DungeonCommandArgs, "command">,
  newId: () => string = () => crypto.randomUUID()
): Result<DungeonCanonValue, DungeonCommandRefusal> {
  if (command.kind === "event") {
    if (isGenerationDungeonCommandEvent(command.event)) {
      return err("generation-event-not-supported")
    }
    return ok(
      isDungeonEvent(command.event)
        ? {
            ...state,
            dungeon: reduceDungeon(state.dungeon, command.event),
          }
        : {
            ...state,
            instance: createReduceMapInstance(newId)(
              state.instance,
              command.event
            ),
          }
    )
  }

  if (command.kind === "searchReveal") {
    return ok({
      dungeon: reduceDungeon(state.dungeon, {
        kind: "markActed",
        characterId: command.characterId,
      }),
      instance: createReduceMapInstance(newId)(state.instance, command.event),
    })
  }

  // `expandStub` and `retractZone` fall through unpredicted (D1): the roll —
  // and the retract inverse it recorded — resolves server-side against the
  // ledger, and a roll was never re-derivable. The pending affordance comes
  // from the root's pending count; the accepted stamp invalidates both axes
  // and the refetched canon paints the result.
  return ok(state)
}

export const dungeonCommand = defineMutation({
  name: "dungeon.command",
  args: dungeonCommandArgs,
  refusal: dungeonCommandRefusalSchema,
  predict: (state: DungeonCanonValue, args: DungeonCommandArgs) =>
    predictDungeonCommand(state, args),
})

export const dungeonProtocol = defineProtocol({
  id: "showtime.dungeon.v1",
  mutations: [dungeonCommand],
})
