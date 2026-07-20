import { describe, expect, it } from "vitest"

import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { defaultOverlay } from "./overlay"
import {
  applyEncounterSessionIntent,
  type EncounterSessionIntent,
} from "./session-intent"
import type { ParticipantShell, SessionShell } from "./session-shell"

const heroId = asParticipantId("hero")
const foeId = asParticipantId("foe")

function participant(
  id: typeof heroId,
  side: "players" | "enemies"
): ParticipantShell {
  return {
    id,
    entity: {
      storage: "inline",
      entity: { id: `${id}-entity`, components: {} },
    },
    overlay: defaultOverlay({ side }),
  }
}

function session(): SessionShell {
  return {
    round: 2,
    currentActorId: heroId,
    advantage: "players",
    firstSide: "players",
    participants: [
      participant(heroId, "players"),
      participant(foeId, "enemies"),
    ],
  }
}

function apply(root: SessionShell, intent: EncounterSessionIntent) {
  return applyEncounterSessionIntent(root, intent)
}

describe("applyEncounterSessionIntent", () => {
  it("applies back-to-back additive intents to the composed root", () => {
    const first = apply(session(), {
      kind: "adjustCounter",
      participantId: heroId,
      counter: "lumina",
      delta: 2,
    })
    expect(first.ok).toBe(true)
    if (!first.ok) return

    const second = apply(first.value, {
      kind: "adjustCounter",
      participantId: heroId,
      counter: "lumina",
      delta: -1,
    })
    expect(second.ok).toBe(true)
    if (!second.ok) return
    expect(second.value.participants[0]?.overlay.counters.lumina).toBe(1)
  })

  it.each(["adjustCounter", "adjustActionEconomy"] as const)(
    "refuses a zero delta for %s",
    (kind) => {
      const intent: EncounterSessionIntent =
        kind === "adjustCounter"
          ? {
              kind,
              participantId: heroId,
              counter: "lumina",
              delta: 0,
            }
          : {
              kind,
              participantId: heroId,
              action: "move",
              delta: 0,
            }
      expect(apply(session(), intent)).toEqual({
        ok: false,
        error: "invalid-delta",
      })
    }
  )

  it("returns the same root for an idempotent desired value", () => {
    const root = session()
    const applied = apply(root, {
      kind: "setSide",
      participantId: heroId,
      side: "players",
    })
    expect(applied).toEqual({ ok: true, value: root })
  })

  it("applies desired overrides and participant overlay values", () => {
    const intents: EncounterSessionIntent[] = [
      { kind: "setSide", participantId: heroId, side: "enemies" },
      {
        kind: "setCurrentActor",
        participantId: foeId,
        expected: {
          round: 2,
          currentActorId: heroId,
        },
      },
      {
        kind: "setActed",
        participantId: heroId,
        hasActed: true,
        expected: {
          round: 2,
          currentActorId: foeId,
          turnsTakenThisRound: 0,
        },
      },
      { kind: "setRound", round: 7 },
      {
        kind: "setBattleConditionFlag",
        participantId: heroId,
        flag: "charged",
        value: true,
      },
      {
        kind: "setAilment",
        participantId: heroId,
        ailment: "burn",
      },
    ]
    const final = intents.reduce((root, intent) => {
      const result = apply(root, intent)
      expect(result.ok).toBe(true)
      return result.ok ? result.value : root
    }, session())

    expect(final.round).toBe(7)
    expect(final.currentActorId).toBe(foeId)
    expect(final.participants[0]?.overlay).toMatchObject({
      allegiance: { side: "enemies" },
      turnState: { turnsTakenThisRound: 1 },
      battleConditions: { charged: true },
      ailments: ["burn"],
    })

    const cleared = apply(final, {
      kind: "clearAilment",
      participantId: heroId,
      ailment: "burn",
    })
    expect(
      cleared.ok && cleared.value.participants[0]?.overlay.ailments
    ).toEqual([])
  })

  it("preserves axis extend, flip, and clear semantics", () => {
    const increase = apply(session(), {
      kind: "adjustBattleConditionAxis",
      participantId: heroId,
      axis: "attack",
      action: "increase",
    })
    expect(increase.ok).toBe(true)
    if (!increase.ok) return
    const extend = apply(increase.value, {
      kind: "adjustBattleConditionAxis",
      participantId: heroId,
      axis: "attack",
      action: "increase",
      turns: 3,
    })
    expect(extend.ok).toBe(true)
    if (!extend.ok) return
    expect(
      extend.value.participants[0]?.overlay.conditionDurations.attack
    ).toBe(6)
    const flip = apply(extend.value, {
      kind: "adjustBattleConditionAxis",
      participantId: heroId,
      axis: "attack",
      action: "decrease",
      turns: 1,
    })
    expect(flip.ok).toBe(true)
    if (!flip.ok) return
    expect(flip.value.participants[0]?.overlay).toMatchObject({
      battleConditions: { attack: "decreased" },
      conditionDurations: { attack: 1 },
    })
    const clear = apply(flip.value, {
      kind: "adjustBattleConditionAxis",
      participantId: heroId,
      axis: "attack",
      action: "clear",
    })
    expect(clear.ok).toBe(true)
    if (!clear.ok) return
    expect(clear.value.participants[0]?.overlay.battleConditions.attack).toBe(
      "neutral"
    )
    expect(
      clear.value.participants[0]?.overlay.conditionDurations.attack
    ).toBeUndefined()
  })

  it("floors additive counters and action usage and clears counter state", () => {
    const counter = apply(session(), {
      kind: "adjustCounter",
      participantId: heroId,
      counter: "lumina",
      delta: 3,
    })
    expect(counter.ok).toBe(true)
    if (!counter.ok) return
    const floored = apply(counter.value, {
      kind: "adjustCounter",
      participantId: heroId,
      counter: "lumina",
      delta: -8,
    })
    expect(floored.ok).toBe(true)
    if (!floored.ok) return
    expect(
      floored.value.participants[0]?.overlay.counters.lumina
    ).toBeUndefined()

    const used = apply(floored.value, {
      kind: "adjustActionEconomy",
      participantId: heroId,
      action: "reaction",
      delta: 2,
    })
    expect(used.ok).toBe(true)
    if (!used.ok) return
    const restored = apply(used.value, {
      kind: "adjustActionEconomy",
      participantId: heroId,
      action: "reaction",
      delta: -9,
    })
    expect(
      restored.ok &&
        restored.value.participants[0]?.overlay.turnState.reactionsUsed
    ).toBe(0)
  })

  it("drafts only against the captured root-local turn frame", () => {
    const root = session()
    const expected = {
      round: 2,
      currentActorId: heroId,
      side: "enemies" as const,
      turnsTakenThisRound: 0,
    }
    const applied = apply(root, {
      kind: "draftCombatant",
      participantId: foeId,
      expected,
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.value.currentActorId).toBe(foeId)

    expect(
      apply(
        { ...root, round: 3 },
        {
          kind: "draftCombatant",
          participantId: foeId,
          expected,
        }
      )
    ).toEqual({ ok: false, error: "draft-no-longer-valid" })
  })

  it("ends only the captured actor turn and ticks condition duration", () => {
    const root = session()
    root.participants[0]!.overlay.battleConditions.attack = "increased"
    root.participants[0]!.overlay.conditionDurations.attack = 1
    const applied = apply(root, {
      kind: "endTurn",
      expected: {
        round: 2,
        currentActorId: heroId,
        actorId: heroId,
        turnsTakenThisRound: 0,
      },
    })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(
      applied.value.participants[0]?.overlay.turnState.turnsTakenThisRound
    ).toBe(1)
    expect(applied.value.participants[0]?.overlay.battleConditions.attack).toBe(
      "neutral"
    )

    expect(
      apply(
        { ...root, currentActorId: foeId },
        {
          kind: "endTurn",
          expected: {
            round: 2,
            currentActorId: heroId,
            actorId: heroId,
            turnsTakenThisRound: 0,
          },
        }
      )
    ).toEqual({ ok: false, error: "turn-frame-changed" })
  })

  it("advances only when roster order and every observed turn count still match", () => {
    const root = session()
    root.participants[0]!.overlay.turnState.turnsTakenThisRound = 1
    root.participants[1]!.overlay.turnState.turnsTakenThisRound = 1
    const expected = {
      round: 2,
      currentActorId: heroId,
      participants: [
        { participantId: heroId, turnsTakenThisRound: 1 },
        { participantId: foeId, turnsTakenThisRound: 1 },
      ],
    }
    const applied = apply(root, { kind: "advanceRound", expected })
    expect(applied.ok).toBe(true)
    if (!applied.ok) return
    expect(applied.value.round).toBe(3)
    expect(applied.value.currentActorId).toBeNull()
    expect(
      applied.value.participants.map(
        (entry) => entry.overlay.turnState.turnsTakenThisRound
      )
    ).toEqual([0, 0])

    expect(
      apply(
        { ...root, participants: [...root.participants].reverse() },
        { kind: "advanceRound", expected }
      )
    ).toEqual({ ok: false, error: "round-no-longer-complete" })
  })

  it.each([
    {
      name: "desired overlay",
      intent: {
        kind: "setAilment",
        participantId: asParticipantId("missing"),
        ailment: "burn",
      },
    },
    {
      name: "preconditioned override",
      intent: {
        kind: "setActed",
        participantId: asParticipantId("missing"),
        hasActed: true,
        expected: {
          round: 2,
          currentActorId: heroId,
          turnsTakenThisRound: 0,
        },
      },
    },
    {
      name: "current-actor override",
      intent: {
        kind: "setCurrentActor",
        participantId: asParticipantId("missing"),
        expected: {
          round: 2,
          currentActorId: heroId,
        },
      },
    },
  ] satisfies Array<{ name: string; intent: EncounterSessionIntent }>)(
    "refuses a missing participant for $name",
    ({ intent }) => {
      expect(apply(session(), intent)).toEqual({
        ok: false,
        error: "participant-not-found",
      })
    }
  )
})
