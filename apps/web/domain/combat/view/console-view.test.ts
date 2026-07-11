import { describe, expect, it } from "vitest"

import { goblin } from "@workspace/game-v2/catalog/enemies/humanoid"
import { makeParticipant } from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import { resolveSession } from "@/domain/game-engine-v2"

import {
  instanceWith,
  sessionWith,
  withDamage,
  withName,
} from "./__fixtures__/combat-view"
import { buildConsoleView } from "./console-view"

const heroId = asParticipantId("hero")
const gobId = asParticipantId("gob")
const deadGobId = asParticipantId("dead-gob")

const mapless = instanceWith({})

describe("buildConsoleView", () => {
  it("projects rows with acted / fallen / eligibility, and the current actor", () => {
    const session = sessionWith(
      [
        makeParticipant(withName(goblin, "Roan"), heroId, {
          side: "players",
          hasActed: true,
        }),
        makeParticipant(goblin, gobId, { side: "enemies" }),
        makeParticipant(withDamage(goblin, 999), deadGobId, {
          side: "enemies",
        }),
      ],
      heroId
    )

    const console = buildConsoleView(session, resolveSession(session, mapless))

    expect(console.rows.map((row) => row.name)).toEqual([
      "Roan",
      "Goblin",
      "Goblin 2",
    ])
    expect(console.rows[0]).toMatchObject({
      hasActed: true,
      isCurrent: true,
      isEligible: false,
    })
    expect(console.rows[1]).toMatchObject({ isFallen: false, isEligible: true })
    expect(console.rows[2]).toMatchObject({ isFallen: true, isEligible: false })
    expect(console.currentActor).toMatchObject({ id: heroId, hasActed: true })
    expect(console.roundComplete).toBe(false)
  })

  it("flags the round complete when no one is left to draft", () => {
    const session = sessionWith([
      makeParticipant(goblin, gobId, { side: "enemies", hasActed: true }),
      makeParticipant(withDamage(goblin, 999), deadGobId, { side: "enemies" }),
    ])

    const console = buildConsoleView(session, resolveSession(session, mapless))

    expect(console.roundComplete).toBe(true)
    expect(console.currentActor).toBeNull()
    expect(console.rows.every((row) => !row.isEligible)).toBe(true)
  })
})
