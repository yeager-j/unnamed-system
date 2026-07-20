import { produce, type Draft } from "immer"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"
import { err, ok, type Result } from "@workspace/result"

import type {
  ActionEconomyEvent,
  AilmentEvent,
  BattleConditionEvent,
  CounterEvent,
  OverrideEvent,
  RosterEvent,
} from "./session-event"
import type { ParticipantShell, SessionShell } from "./session-shell"
import {
  BATTLE_CONDITION_AXIS_KEYS,
  DEFAULT_BATTLE_CONDITION_TURNS,
  type BattleConditionState,
} from "./vocab"

export interface TurnFramePrecondition {
  readonly round: number
  readonly currentActorId: ParticipantId | null
}

export interface ParticipantTurnPrecondition {
  readonly participantId: ParticipantId
  readonly turnsTakenThisRound: number
}

export type DraftCombatantIntent = {
  readonly kind: "draftCombatant"
  readonly participantId: ParticipantId
  readonly expected: TurnFramePrecondition & {
    readonly side: CombatSide
    readonly turnsTakenThisRound: number
  }
}

export type EndTurnIntent = {
  readonly kind: "endTurn"
  readonly expected: TurnFramePrecondition & {
    readonly actorId: ParticipantId
    readonly turnsTakenThisRound: number
  }
}

export type AdvanceRoundIntent = {
  readonly kind: "advanceRound"
  readonly expected: TurnFramePrecondition & {
    readonly participants: readonly ParticipantTurnPrecondition[]
  }
}

export type SetCurrentActorIntent = Extract<
  OverrideEvent,
  { kind: "setCurrentActor" }
> & {
  readonly expected: TurnFramePrecondition
}

export type SetActedIntent = Extract<OverrideEvent, { kind: "setActed" }> & {
  readonly expected: TurnFramePrecondition & {
    readonly turnsTakenThisRound: number
  }
}

export type EncounterSessionIntent =
  | DraftCombatantIntent
  | EndTurnIntent
  | AdvanceRoundIntent
  | Extract<RosterEvent, { kind: "setSide" }>
  | SetCurrentActorIntent
  | SetActedIntent
  | Extract<OverrideEvent, { kind: "setRound" }>
  | BattleConditionEvent
  | AilmentEvent
  | CounterEvent
  | ActionEconomyEvent

export type SessionIntentRefusal =
  | "participant-not-found"
  | "turn-frame-changed"
  | "draft-no-longer-valid"
  | "round-no-longer-complete"
  | "invalid-delta"

const ACTION_USED_FIELD = {
  move: "movesUsed",
  standard: "standardsUsed",
  reaction: "reactionsUsed",
} as const

export function applyEncounterSessionIntent(
  session: SessionShell,
  intent: EncounterSessionIntent
): Result<SessionShell, SessionIntentRefusal> {
  switch (intent.kind) {
    case "draftCombatant":
      return applyDraftCombatant(session, intent)
    case "endTurn":
      return applyEndTurn(session, intent)
    case "advanceRound":
      return applyAdvanceRound(session, intent)
    case "setSide":
      return updateParticipant(session, intent.participantId, (participant) => {
        participant.overlay.allegiance.side = intent.side
      })
    case "setCurrentActor":
      if (!matchesTurnFrame(session, intent.expected)) {
        return err("turn-frame-changed")
      }
      if (!hasParticipant(session, intent.participantId)) {
        return err("participant-not-found")
      }
      return ok(
        produce(session, (draft) => {
          draft.currentActorId = intent.participantId
        })
      )
    case "setActed": {
      if (!matchesTurnFrame(session, intent.expected)) {
        return err("turn-frame-changed")
      }
      const participant = findParticipant(session, intent.participantId)
      if (participant === undefined) return err("participant-not-found")
      if (
        participant.overlay.turnState.turnsTakenThisRound !==
        intent.expected.turnsTakenThisRound
      ) {
        return err("turn-frame-changed")
      }
      return updateParticipant(
        session,
        intent.participantId,
        (draftParticipant) => {
          draftParticipant.overlay.turnState.turnsTakenThisRound =
            intent.hasActed ? 1 : 0
        }
      )
    }
    case "setRound":
      return ok(
        produce(session, (draft) => {
          draft.round = intent.round
        })
      )
    case "adjustBattleConditionAxis":
    case "setBattleConditionFlag":
      return applyBattleCondition(session, intent)
    case "setAilment":
    case "clearAilment":
      return applyAilment(session, intent)
    case "adjustCounter":
    case "clearCounter":
      if (
        intent.kind === "adjustCounter" &&
        (!Number.isInteger(intent.delta) || intent.delta === 0)
      ) {
        return err("invalid-delta")
      }
      return applyCounter(session, intent)
    case "adjustActionEconomy":
      if (!Number.isInteger(intent.delta) || intent.delta === 0) {
        return err("invalid-delta")
      }
      return updateParticipant(session, intent.participantId, (participant) => {
        const { turnState } = participant.overlay
        const field = ACTION_USED_FIELD[intent.action]
        turnState[field] = Math.max(0, turnState[field] + intent.delta)
      })
  }
}

function applyDraftCombatant(
  session: SessionShell,
  intent: DraftCombatantIntent
): Result<SessionShell, SessionIntentRefusal> {
  if (!matchesTurnFrame(session, intent.expected)) {
    return err("draft-no-longer-valid")
  }
  const participant = findParticipant(session, intent.participantId)
  if (participant === undefined) return err("participant-not-found")
  const { turnState } = participant.overlay
  if (
    participant.overlay.allegiance.side !== intent.expected.side ||
    turnState.turnsTakenThisRound !== intent.expected.turnsTakenThisRound ||
    turnState.turnsTakenThisRound !== 0
  ) {
    return err("draft-no-longer-valid")
  }

  return ok(
    produce(session, (draft) => {
      const draftParticipant = draft.participants.find(
        (entry) => entry.id === intent.participantId
      )!
      draft.currentActorId = intent.participantId
      draftParticipant.overlay.turnState.movesUsed = 0
      draftParticipant.overlay.turnState.standardsUsed = 0
      draftParticipant.overlay.turnState.reactionsUsed = 0
      draftParticipant.overlay.ailments =
        draftParticipant.overlay.ailments.filter(
          (ailment) => ailment !== "downed"
        )
    })
  )
}

function applyEndTurn(
  session: SessionShell,
  intent: EndTurnIntent
): Result<SessionShell, SessionIntentRefusal> {
  if (
    !matchesTurnFrame(session, intent.expected) ||
    session.currentActorId !== intent.expected.actorId
  ) {
    return err("turn-frame-changed")
  }
  const actor = findParticipant(session, intent.expected.actorId)
  if (actor === undefined) return err("participant-not-found")
  if (
    actor.overlay.turnState.turnsTakenThisRound !==
    intent.expected.turnsTakenThisRound
  ) {
    return err("turn-frame-changed")
  }

  return updateParticipant(session, intent.expected.actorId, (participant) => {
    participant.overlay.turnState.turnsTakenThisRound += 1
    for (const axis of BATTLE_CONDITION_AXIS_KEYS) {
      const remaining = participant.overlay.conditionDurations[axis]
      if (remaining === undefined) continue
      if (remaining > 1) {
        participant.overlay.conditionDurations[axis] = remaining - 1
      } else {
        delete participant.overlay.conditionDurations[axis]
        participant.overlay.battleConditions[axis] = "neutral"
      }
    }
  })
}

function applyAdvanceRound(
  session: SessionShell,
  intent: AdvanceRoundIntent
): Result<SessionShell, SessionIntentRefusal> {
  if (
    !matchesTurnFrame(session, intent.expected) ||
    !matchesParticipantTurns(session, intent.expected.participants)
  ) {
    return err("round-no-longer-complete")
  }

  return ok(
    produce(session, (draft) => {
      draft.round += 1
      draft.currentActorId = null
      for (const participant of draft.participants) {
        participant.overlay.turnState.turnsTakenThisRound = 0
      }
    })
  )
}

function applyBattleCondition(
  session: SessionShell,
  intent: BattleConditionEvent
): Result<SessionShell, SessionIntentRefusal> {
  return updateParticipant(session, intent.participantId, (participant) => {
    const { battleConditions, conditionDurations } = participant.overlay
    if (intent.kind === "setBattleConditionFlag") {
      battleConditions[intent.flag] = intent.value
      return
    }
    if (intent.action === "clear") {
      battleConditions[intent.axis] = "neutral"
      delete conditionDurations[intent.axis]
      return
    }

    const target: BattleConditionState =
      intent.action === "increase" ? "increased" : "decreased"
    const turns = intent.turns ?? DEFAULT_BATTLE_CONDITION_TURNS
    if (battleConditions[intent.axis] === target) {
      conditionDurations[intent.axis] =
        (conditionDurations[intent.axis] ?? 0) + turns
    } else {
      battleConditions[intent.axis] = target
      conditionDurations[intent.axis] = turns
    }
  })
}

function applyAilment(
  session: SessionShell,
  intent: AilmentEvent
): Result<SessionShell, SessionIntentRefusal> {
  return updateParticipant(session, intent.participantId, (participant) => {
    if (intent.kind === "setAilment") {
      if (!participant.overlay.ailments.includes(intent.ailment)) {
        participant.overlay.ailments.push(intent.ailment)
      }
      return
    }
    participant.overlay.ailments = participant.overlay.ailments.filter(
      (ailment) => ailment !== intent.ailment
    )
  })
}

function applyCounter(
  session: SessionShell,
  intent: CounterEvent
): Result<SessionShell, SessionIntentRefusal> {
  return updateParticipant(session, intent.participantId, (participant) => {
    const { counters } = participant.overlay
    if (intent.kind === "clearCounter") {
      delete counters[intent.counter]
      return
    }
    const next = Math.max(0, (counters[intent.counter] ?? 0) + intent.delta)
    if (next === 0) delete counters[intent.counter]
    else counters[intent.counter] = next
  })
}

function updateParticipant(
  session: SessionShell,
  participantId: ParticipantId,
  update: (participant: Draft<ParticipantShell>) => void
): Result<SessionShell, SessionIntentRefusal> {
  if (!hasParticipant(session, participantId)) {
    return err("participant-not-found")
  }
  return ok(updateParticipantValue(session, participantId, update))
}

function updateParticipantValue(
  session: SessionShell,
  participantId: ParticipantId,
  update: (participant: Draft<ParticipantShell>) => void
): SessionShell {
  return produce(session, (draft) => {
    const participant = draft.participants.find(
      (entry) => entry.id === participantId
    )
    if (participant !== undefined) update(participant)
  })
}

function matchesTurnFrame(
  session: SessionShell,
  expected: TurnFramePrecondition
): boolean {
  return (
    session.round === expected.round &&
    session.currentActorId === expected.currentActorId
  )
}

function matchesParticipantTurns(
  session: SessionShell,
  expected: readonly ParticipantTurnPrecondition[]
): boolean {
  if (session.participants.length !== expected.length) return false
  return session.participants.every(
    (participant, index) =>
      participant.id === expected[index]?.participantId &&
      participant.overlay.turnState.turnsTakenThisRound ===
        expected[index]?.turnsTakenThisRound
  )
}

function hasParticipant(
  session: SessionShell,
  participantId: ParticipantId
): boolean {
  return findParticipant(session, participantId) !== undefined
}

function findParticipant(
  session: SessionShell,
  participantId: ParticipantId
): SessionShell["participants"][number] | undefined {
  return session.participants.find(
    (participant) => participant.id === participantId
  )
}
