import { z } from "zod/v4"

import {
  ACTION_ECONOMY_ACTIONS,
  AILMENT_KEYS,
  applyEncounterSessionIntent,
  BATTLE_CONDITION_AXIS_ACTIONS,
  BATTLE_CONDITION_AXIS_KEYS,
  BATTLE_CONDITION_FLAG_KEYS,
  COUNTER_KEYS,
  defaultOverlay,
  storedEntitySchema,
  type CombatEvent,
  type EncounterSessionIntent,
  type ParticipantShell,
  type SessionIntentRefusal,
  type SessionShell,
  type StoredEntity,
} from "@workspace/game-v2/encounter"
import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import { loadEntity } from "@workspace/game-v2/kernel/load-seam"
import {
  participantIdSchema,
  type ParticipantId,
} from "@workspace/game-v2/kernel/participant-id.schema"
import {
  COMBAT_SIDES,
  type CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"
import {
  defineMutation,
  defineMutations,
  type InvocationOf,
  type MutationRegistry,
} from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

import type { EncounterStatus } from "@/lib/db/schema/encounter"

import { mergeComponents } from "../../entity/commit/merge-patch"
import { combatEntityWriteSchema } from "../../entity/commit/write.schema"
import {
  applyEntityWrite,
  type EntityWriteRefusal,
} from "../../entity/commit/writers"

/**
 * The combat replica roots (UNN-646, storage-native encounter root UNN-655).
 * Combat has two persistence homes, so it has two root families — replica
 * granularity follows the authority's commit scope (the row-lock + auth
 * boundary), never the UI's dispatch scope:
 *
 * - **Durable**: one replica per durable participant's `entity` row. Its root
 *   is that entity's combat-writable components — deliberately NOT the owner
 *   root (`EntityReplicaState`): no columns, no narrative, nothing the DM may
 *   not hold. The narrowing is structural redaction, pinned by the snapshot
 *   door's security test.
 * - **Encounter**: ONE replica per encounter row, whose value is the row's
 *   own atomically stored facts — `status` plus the storage-native
 *   {@link SessionShell} (scalars, roster order, overlays, inline entities,
 *   durable *references*). Durable entity values and Map Instance state are
 *   structurally absent: they live under other rows' locks, gates, cursors,
 *   and lifetimes, and are joined into views by the application composition
 *   seam, never copied into this root.
 *
 * A single replica spanning both homes was considered and rejected: it would
 * need an atomic accepted observation across N entity rows plus the blob, and
 * it would couple both persistence homes into one transaction scope — exactly
 * the cross-replica coordination the design defers. The durable/inline branch
 * stays at the app's ownership decision point, which returns the appropriate
 * replica; `@workspace/replica` learns nothing about combatants.
 */
export type CombatEntityComponents = Partial<
  Pick<ComponentRegistry, "vitals" | "skillPool" | "resources" | "mechanics">
>

/** The structural redaction: exactly what the combat Writers read and write
 *  (verified against `ENTITY_WRITERS` — each combat arm touches only its own
 *  component; mechanics resolves its registry statically). Dropped components
 *  are structurally absent, never `undefined`-valued. */
export function pickCombatComponents(
  components: Partial<ComponentRegistry>
): CombatEntityComponents {
  const { vitals, skillPool, resources, mechanics } = components
  return {
    ...(vitals !== undefined ? { vitals } : {}),
    ...(skillPool !== undefined ? { skillPool } : {}),
    ...(resources !== undefined ? { resources } : {}),
    ...(mechanics !== undefined ? { mechanics } : {}),
  }
}

/** Durable home: one durable participant's entity row. */
export interface CombatDurableState {
  readonly components: CombatEntityComponents
}

/**
 * The encounter root (UNN-655): the encounter row's own facts, whole. The
 * shell's inline entities carry their FULL component bags — the root is the
 * storage, and the gate (campaign DM, the row's sole sanctioned writer) is
 * its whole license; the four-component narrowing remains the durable roots'
 * posture. `EncounterStatus` rides along so the liveness precondition is one
 * decided-once code path across optimistic apply, rebase, and the authority's
 * locked apply.
 */
export interface EncounterReplicaState {
  readonly status: EncounterStatus
  readonly session: SessionShell
  /**
   * The encounter row's own version — an atomically stored fact of the same
   * row, carried in the value (UNN-657) so the composition seam can arbitrate
   * roster membership between this root and the command-owned loader frame:
   * whichever side is newer decides presence, which is what stops a
   * command-removed participant resurrecting from a not-yet-pulled root (and,
   * mirrored, lets a replica-added participant render before the frame
   * refresh lands). Mutations never touch it; it advances only through
   * accepted snapshots.
   */
  readonly version: number
}

/**
 * A Writer refusal on either root, plus the encounter root's roster refusal:
 * a pending write whose participant an external roster change removed
 * refuses on replay and surfaces as a rebase conflict — preconditioned
 * intent, not silently dropped.
 */
export type CombatWriteRefusal = EntityWriteRefusal | "participant-not-found"

/**
 * The encounter mutation's full refusal set. `participant-not-inline` and
 * `encounter-not-live` were door-only codes before UNN-655; with the root
 * carrying the locator arms and the status, both preconditions are decided
 * in the one registered apply — an optimistic dispatch, a rebase replay, and
 * the authority's locked delivery all refuse identically.
 */
export type EncounterWriteRefusal =
  | CombatWriteRefusal
  | SessionIntentRefusal
  | "participant-not-inline"
  | "encounter-not-live"
  | "encounter-ended"
  | "invalid-entity"

/**
 * The durable home's mutation: args ARE the encounter door's existing
 * `CombatEntityWrite` subset (pools/resources/mechanics — the same
 * schema-level vocabulary restriction the classic door pinned with a
 * rejection test), applied by the same `applyEntityWrite` the authority
 * commits with. Named apart from the owner door's `entity.write` so the
 * combat authority's decode admits exactly this subset.
 */
export const writeCombatEntity = defineMutation({
  name: "combat.entity.write",
  args: combatEntityWriteSchema,
  apply(state: CombatDurableState, write) {
    const patch = applyEntityWrite(state.components, write)
    if (!patch.ok) return err<CombatWriteRefusal>(patch.error)
    return ok({
      components: pickCombatComponents(
        mergeComponents(state.components, patch.value)
      ),
    })
  },
})

/**
 * The encounter root's mutation: one component write addressed to one INLINE
 * roster participant, applied to the inline entity data inside the
 * storage-native root. A durable-addressed write fails closed
 * (`participant-not-inline` — the home is the stored locator's fact, so a
 * wrong client belief cannot mis-route), and a non-live encounter refuses
 * before any state is touched. Both sides of the wire run THIS apply: the
 * client predicts with it and the authority commits with it against the shell
 * built from the locked row.
 */
export const writeEncounterInline = defineMutation({
  name: "encounter.writeInline",
  args: z.object({
    participantId: participantIdSchema,
    write: combatEntityWriteSchema,
  }),
  apply(state: EncounterReplicaState, { participantId, write }) {
    if (state.status !== "live")
      return err<EncounterWriteRefusal>("encounter-not-live")
    const index = state.session.participants.findIndex(
      (participant) => participant.id === participantId
    )
    const shell = state.session.participants[index]
    if (shell === undefined)
      return err<EncounterWriteRefusal>("participant-not-found")
    if (shell.entity.storage !== "inline")
      return err<EncounterWriteRefusal>("participant-not-inline")

    const entity = shell.entity.entity
    const patch = applyEntityWrite(entity.components, write)
    if (!patch.ok) return err<EncounterWriteRefusal>(patch.error)

    const participants = state.session.participants.map((participant, at) =>
      at === index
        ? {
            ...shell,
            entity: {
              storage: "inline" as const,
              entity: {
                ...entity,
                components: mergeComponents(entity.components, patch.value),
              },
            },
          }
        : participant
    )
    return ok({
      ...state,
      session: { ...state.session, participants },
    })
  },
})

/**
 * The single-root roster add (UNN-657): a batch of INLINE participants, each a
 * whole stored entity plus a **client-minted participant id** — the natural
 * idempotency key. The UNN-657 audit reassessed the classic router's zone-less
 * inline add and catalog-enemy materialization: both write only the encounter
 * row (an unplaced joiner holds no occupancy token until `placeCombatant`
 * mints one), so they are replayable single-root intent, not commands. Catalog
 * materialization happens client-side through `buildReinforcements` (the
 * deterministic shared `instantiateEnemy`); the wire carries the entities
 * whole, exactly as the classic inline arm did, re-validated here through the
 * same {@link loadEntity} F6 seam on both sides of the wire.
 *
 * Draft and live are both admitted (setup adds vs mid-combat reinforcements);
 * `ended` refuses. A live joiner enters already-acted (R6.2 — queued for the
 * next round); a draft joiner enters un-acted. Already-present ids are
 * filtered, so a duplicate delivery no-ops — on the authority that hits the
 * processor's deepEqual short-circuit: watermark recorded, no version bump,
 * no ping. Placed adds (occupancy) and durable adds (server hydration) remain
 * commands.
 */
export const addEncounterInlineParticipants = defineMutation({
  name: "encounter.addInlineParticipants",
  args: z.object({
    participants: z
      .array(
        z.object({
          participantId: participantIdSchema,
          side: z.enum(COMBAT_SIDES),
          entity: storedEntitySchema,
        })
      )
      .min(1),
  }),
  apply(state: EncounterReplicaState, { participants }) {
    if (state.status === "ended") {
      return err<EncounterWriteRefusal>("encounter-ended")
    }
    const additions = participants.filter((addition) =>
      state.session.participants.every(
        (existing) => existing.id !== addition.participantId
      )
    )
    if (additions.length === 0) return ok(state)

    const shells: ParticipantShell[] = []
    for (const addition of additions) {
      const parsed = loadEntity(addition.entity.id, addition.entity.components)
      if (!parsed.ok) return err<EncounterWriteRefusal>("invalid-entity")
      shells.push({
        id: addition.participantId,
        entity: { storage: "inline", entity: parsed.value },
        overlay: defaultOverlay({
          side: addition.side,
          hasActed: state.status === "live",
        }),
      })
    }
    return ok({
      ...state,
      session: {
        ...state.session,
        participants: [...state.session.participants, ...shells],
      },
    })
  },
})

const turnFrameSchema = z.object({
  round: z.number().int().positive(),
  currentActorId: participantIdSchema.nullable(),
})

const participantTurnsSchema = z.object({
  participantId: participantIdSchema,
  turnsTakenThisRound: z.number().int().nonnegative(),
})

const nonZeroIntegerSchema = z
  .number()
  .int()
  .refine((value) => value !== 0)

export const draftEncounterCombatant = defineMutation({
  name: "encounter.draftCombatant",
  args: z.object({
    participantId: participantIdSchema,
    expected: turnFrameSchema.extend({
      side: z.enum(COMBAT_SIDES),
      turnsTakenThisRound: z.number().int().nonnegative(),
    }),
  }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, { kind: "draftCombatant", ...args })
  },
})

export const endEncounterTurn = defineMutation({
  name: "encounter.endTurn",
  args: z.object({
    expected: turnFrameSchema.extend({
      actorId: participantIdSchema,
      turnsTakenThisRound: z.number().int().nonnegative(),
    }),
  }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, { kind: "endTurn", ...args })
  },
})

export const advanceEncounterRound = defineMutation({
  name: "encounter.advanceRound",
  args: z.object({
    expected: turnFrameSchema.extend({
      participants: z.array(participantTurnsSchema),
    }),
  }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, { kind: "advanceRound", ...args })
  },
})

export const setEncounterParticipantSide = defineMutation({
  name: "encounter.setSide",
  args: z.object({
    participantId: participantIdSchema,
    side: z.enum(COMBAT_SIDES),
  }),
  apply(state: EncounterReplicaState, args) {
    if (state.status === "ended") {
      return err<EncounterWriteRefusal>("encounter-ended")
    }
    return applySessionIntent(state, { kind: "setSide", ...args })
  },
})

export const setEncounterCurrentActor = defineMutation({
  name: "encounter.setCurrentActor",
  args: z.object({
    participantId: participantIdSchema,
    expected: turnFrameSchema,
  }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, {
      kind: "setCurrentActor",
      ...args,
    })
  },
})

export const setEncounterParticipantActed = defineMutation({
  name: "encounter.setActed",
  args: z.object({
    participantId: participantIdSchema,
    hasActed: z.boolean(),
    expected: turnFrameSchema.extend({
      turnsTakenThisRound: z.number().int().nonnegative(),
    }),
  }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, { kind: "setActed", ...args })
  },
})

export const setEncounterRound = defineMutation({
  name: "encounter.setRound",
  args: z.object({ round: z.number().int().positive() }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, { kind: "setRound", ...args })
  },
})

export const adjustEncounterBattleConditionAxis = defineMutation({
  name: "encounter.adjustBattleConditionAxis",
  args: z.object({
    participantId: participantIdSchema,
    axis: z.enum(BATTLE_CONDITION_AXIS_KEYS),
    action: z.enum(BATTLE_CONDITION_AXIS_ACTIONS),
    turns: z.number().int().positive().optional(),
  }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, {
      kind: "adjustBattleConditionAxis",
      ...args,
    })
  },
})

export const setEncounterBattleConditionFlag = defineMutation({
  name: "encounter.setBattleConditionFlag",
  args: z.object({
    participantId: participantIdSchema,
    flag: z.enum(BATTLE_CONDITION_FLAG_KEYS),
    value: z.boolean(),
  }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, {
      kind: "setBattleConditionFlag",
      ...args,
    })
  },
})

export const setEncounterAilment = defineMutation({
  name: "encounter.setAilment",
  args: z.object({
    participantId: participantIdSchema,
    ailment: z.enum(AILMENT_KEYS),
  }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, { kind: "setAilment", ...args })
  },
})

export const clearEncounterAilment = defineMutation({
  name: "encounter.clearAilment",
  args: z.object({
    participantId: participantIdSchema,
    ailment: z.enum(AILMENT_KEYS),
  }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, { kind: "clearAilment", ...args })
  },
})

export const adjustEncounterCounter = defineMutation({
  name: "encounter.adjustCounter",
  args: z.object({
    participantId: participantIdSchema,
    counter: z.enum(COUNTER_KEYS),
    delta: nonZeroIntegerSchema,
  }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, { kind: "adjustCounter", ...args })
  },
})

export const clearEncounterCounter = defineMutation({
  name: "encounter.clearCounter",
  args: z.object({
    participantId: participantIdSchema,
    counter: z.enum(COUNTER_KEYS),
  }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, { kind: "clearCounter", ...args })
  },
})

export const adjustEncounterActionEconomy = defineMutation({
  name: "encounter.adjustActionEconomy",
  args: z.object({
    participantId: participantIdSchema,
    action: z.enum(ACTION_ECONOMY_ACTIONS),
    delta: nonZeroIntegerSchema,
  }),
  apply(state: EncounterReplicaState, args) {
    return applyLiveSessionIntent(state, {
      kind: "adjustActionEconomy",
      ...args,
    })
  },
})

function applyLiveSessionIntent(
  state: EncounterReplicaState,
  intent: EncounterSessionIntent
) {
  if (state.status !== "live") {
    return err<EncounterWriteRefusal>("encounter-not-live")
  }
  return applySessionIntent(state, intent)
}

function applySessionIntent(
  state: EncounterReplicaState,
  intent: EncounterSessionIntent
) {
  const applied = applyEncounterSessionIntent(state.session, intent)
  if (!applied.ok) return err<EncounterWriteRefusal>(applied.error)
  if (applied.value === state.session) return ok(state)
  return ok({ ...state, session: applied.value })
}

/**
 * The zone-less inline roster add as the consoles dispatch it (UNN-657): a
 * batch of whole stored entities with client-minted participant ids. The one
 * roster gesture that is replica intent — placed and durable adds, removes,
 * and lifecycle remain commands.
 */
export interface AddInlineParticipantsEvent {
  readonly kind: "addInlineParticipants"
  readonly participants: readonly {
    readonly participantId: ParticipantId
    readonly side: CombatSide
    readonly entity: StoredEntity
  }[]
}

export type EncounterSessionEvent =
  | Exclude<
      CombatEvent,
      { kind: "startCombat" | "addParticipant" | "removeParticipant" }
    >
  | AddInlineParticipantsEvent

export function createEncounterSessionInvocation(
  state: EncounterReplicaState,
  event: EncounterSessionEvent,
  options: { readonly roundComplete: boolean }
): Result<EncounterInvocation, SessionIntentRefusal> {
  const expectedFrame = {
    round: state.session.round,
    currentActorId: state.session.currentActorId,
  }

  switch (event.kind) {
    case "addInlineParticipants":
      return ok(
        addEncounterInlineParticipants({
          participants: [...event.participants],
        })
      )
    case "draftCombatant": {
      const participant = participantOf(state.session, event.participantId)
      if (participant === undefined) return err("participant-not-found")
      return ok(
        draftEncounterCombatant({
          participantId: event.participantId,
          expected: {
            ...expectedFrame,
            side: participant.overlay.allegiance.side,
            turnsTakenThisRound:
              participant.overlay.turnState.turnsTakenThisRound,
          },
        })
      )
    }
    case "endTurn": {
      const actorId = state.session.currentActorId
      if (actorId === null) return err("turn-frame-changed")
      const actor = participantOf(state.session, actorId)
      if (actor === undefined) return err("participant-not-found")
      return ok(
        endEncounterTurn({
          expected: {
            ...expectedFrame,
            actorId,
            turnsTakenThisRound: actor.overlay.turnState.turnsTakenThisRound,
          },
        })
      )
    }
    case "advanceRound":
      if (!options.roundComplete) return err("round-no-longer-complete")
      return ok(
        advanceEncounterRound({
          expected: {
            ...expectedFrame,
            participants: state.session.participants.map((participant) => ({
              participantId: participant.id,
              turnsTakenThisRound:
                participant.overlay.turnState.turnsTakenThisRound,
            })),
          },
        })
      )
    case "setSide":
      return ok(setEncounterParticipantSide(event))
    case "setCurrentActor":
      return ok(setEncounterCurrentActor({ ...event, expected: expectedFrame }))
    case "setActed": {
      const participant = participantOf(state.session, event.participantId)
      if (participant === undefined) return err("participant-not-found")
      return ok(
        setEncounterParticipantActed({
          ...event,
          expected: {
            ...expectedFrame,
            turnsTakenThisRound:
              participant.overlay.turnState.turnsTakenThisRound,
          },
        })
      )
    }
    case "setRound":
      return ok(setEncounterRound(event))
    case "adjustBattleConditionAxis":
      return ok(adjustEncounterBattleConditionAxis(event))
    case "setBattleConditionFlag":
      return ok(setEncounterBattleConditionFlag(event))
    case "setAilment":
      return ok(setEncounterAilment(event))
    case "clearAilment":
      return ok(clearEncounterAilment(event))
    case "adjustCounter":
      return ok(adjustEncounterCounter(event))
    case "clearCounter":
      return ok(clearEncounterCounter(event))
    case "adjustActionEconomy":
      return ok(adjustEncounterActionEconomy(event))
  }
}

function participantOf(session: SessionShell, participantId: string) {
  return session.participants.find(
    (participant) => participant.id === participantId
  )
}

export type CombatDurableInvocation = InvocationOf<typeof writeCombatEntity>
export type EncounterInvocation =
  | InvocationOf<typeof writeEncounterInline>
  | InvocationOf<typeof addEncounterInlineParticipants>
  | InvocationOf<typeof draftEncounterCombatant>
  | InvocationOf<typeof endEncounterTurn>
  | InvocationOf<typeof advanceEncounterRound>
  | InvocationOf<typeof setEncounterParticipantSide>
  | InvocationOf<typeof setEncounterCurrentActor>
  | InvocationOf<typeof setEncounterParticipantActed>
  | InvocationOf<typeof setEncounterRound>
  | InvocationOf<typeof adjustEncounterBattleConditionAxis>
  | InvocationOf<typeof setEncounterBattleConditionFlag>
  | InvocationOf<typeof setEncounterAilment>
  | InvocationOf<typeof clearEncounterAilment>
  | InvocationOf<typeof adjustEncounterCounter>
  | InvocationOf<typeof clearEncounterCounter>
  | InvocationOf<typeof adjustEncounterActionEconomy>

export const combatDurableMutations: MutationRegistry<
  CombatDurableState,
  CombatDurableInvocation,
  CombatWriteRefusal
> = defineMutations([writeCombatEntity])

export const encounterMutations: MutationRegistry<
  EncounterReplicaState,
  EncounterInvocation,
  EncounterWriteRefusal
> = defineMutations([
  writeEncounterInline,
  addEncounterInlineParticipants,
  draftEncounterCombatant,
  endEncounterTurn,
  advanceEncounterRound,
  setEncounterParticipantSide,
  setEncounterCurrentActor,
  setEncounterParticipantActed,
  setEncounterRound,
  adjustEncounterBattleConditionAxis,
  setEncounterBattleConditionFlag,
  setEncounterAilment,
  clearEncounterAilment,
  adjustEncounterCounter,
  clearEncounterCounter,
  adjustEncounterActionEconomy,
])
