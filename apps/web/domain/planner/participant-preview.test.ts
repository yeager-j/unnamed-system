import { describe, expect, it } from "vitest"

import type { StoredSession } from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import {
  encounterDurableEnemyIds,
  encounterEnemyLabels,
  previewSummary,
} from "./participant-preview"

describe("previewSummary", () => {
  it("collapses a chip-bearing body into plain prose", () => {
    expect(
      previewSummary(
        "The tide-wardens answer to [[npc:n1|Maren]],\nnot the crown."
      )
    ).toBe("The tide-wardens answer to Maren, not the crown.")
  })

  it("trails off at the last whole word inside the limit", () => {
    const summary = previewSummary(`${"tide ".repeat(40)}wardens`)

    expect(summary).toMatch(/…$/)
    expect(summary).not.toMatch(/ …$/)
    expect(summary!.length).toBeLessThanOrEqual(141)
  })

  it("reads an empty body as no summary at all", () => {
    expect(previewSummary("   \n\n ")).toBeNull()
  })
})

function session(participants: StoredSession["participants"]): StoredSession {
  return {
    round: 1,
    currentActorId: null,
    advantage: null,
    firstSide: null,
    participants,
  }
}

function inline(id: string, name: string, side: string) {
  return {
    id: id as ParticipantId,
    locator: {
      storage: "inline" as const,
      entity: { id: `entity-${id}`, components: { identity: { name } } },
    },
    overlay: { allegiance: { side } },
  }
}

function durable(id: string, entityId: string, side: string) {
  return {
    id: id as ParticipantId,
    locator: { storage: "durable" as const, entityId },
    overlay: { allegiance: { side } },
  }
}

describe("encounter enemy labels (UNN-624 embed card chips)", () => {
  const stored = session([
    durable("p1", "entity-vell", "players"),
    inline("e1", "Goblin", "enemies"),
    inline("e2", "Goblin", "enemies"),
    durable("e3", "entity-maren", "enemies"),
  ])

  it("collects enemy-side labels in roster order, duplicates kept", () => {
    const names = new Map([["entity-maren", "Maren the Hollow"]])
    expect(encounterEnemyLabels(stored, names)).toEqual([
      "Goblin",
      "Goblin",
      "Maren the Hollow",
    ])
  })

  it("lists only durable enemy ids for the batch name read", () => {
    expect(encounterDurableEnemyIds(stored)).toEqual(["entity-maren"])
  })

  it("falls back rather than breaks on missing names and malformed overlays", () => {
    const hostile = session([
      durable("e1", "entity-gone", "enemies"),
      inline("e2", "   ", "enemies"),
      {
        id: "e3" as ParticipantId,
        locator: stored.participants[1]!.locator,
        overlay: "junk",
      },
    ])
    expect(encounterEnemyLabels(hostile, new Map())).toEqual([
      "Unknown enemy",
      "Unnamed enemy",
    ])
  })
})
