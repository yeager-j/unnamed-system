import { describe, expect, it } from "vitest"

import {
  createDungeonState,
  emptyMapInstance,
} from "@workspace/game-v2/spatial"

import {
  dungeonCommand,
  predictDungeonCommand,
  type DungeonCanonValue,
} from "./protocol"

const state: DungeonCanonValue = {
  dungeon: { ...createDungeonState(), turnCounter: 1 },
  instance: {
    ...emptyMapInstance(),
    geometry: {
      ...emptyMapInstance().geometry,
      zones: {
        z1: {
          id: "z1",
          name: "Hall",
          description: "",
          dmNotes: "",
          pageId: "default",
          position: { x: 0, y: 0 },
        },
      },
    },
  },
}

describe("showtime.dungeon.v1", () => {
  it("predicts both axes for search-and-reveal", () => {
    const predicted = predictDungeonCommand(state, {
      command: {
        kind: "searchReveal",
        characterId: "pc-1",
        event: { kind: "revealZone", zoneId: "z1" },
      },
    })

    expect(predicted).toEqual({
      ok: true,
      value: expect.objectContaining({
        dungeon: expect.objectContaining({ actedCharacterIds: ["pc-1"] }),
        instance: expect.objectContaining({
          reveal: expect.objectContaining({ revealedZoneIds: ["z1"] }),
        }),
      }),
    })
  })

  it("applies sequential events to the latest predicted frame", () => {
    const first = predictDungeonCommand(state, {
      command: {
        kind: "event",
        event: { kind: "markActed", characterId: "pc-1" },
      },
    })
    if (!first.ok) throw new Error("expected first prediction")

    const second = predictDungeonCommand(first.value, {
      command: {
        kind: "event",
        event: { kind: "markActed", characterId: "pc-2" },
      },
    })

    expect(second).toEqual({
      ok: true,
      value: expect.objectContaining({
        dungeon: expect.objectContaining({
          actedCharacterIds: ["pc-1", "pc-2"],
        }),
      }),
    })
  })

  it("puts intent but no revisions on the wire", () => {
    const invocation = dungeonCommand({
      dungeonId: "dungeon-1",
      command: {
        kind: "searchReveal",
        characterId: "pc-1",
        event: { kind: "revealZone", zoneId: "z1" },
      },
    })

    expect(invocation.name).toBe("dungeon.command")
    expect(JSON.stringify(invocation)).not.toMatch(/version|axis|actor/)
  })
})
