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

  it("leaves generation commands unpredicted — the same state reference back (D1)", () => {
    // The roll (and the retract inverse it recorded) is server-owned; there is
    // nothing sound to predict. The pending affordance comes from the root's
    // pending count; catch-up is stamp → axis invalidation → refetch.
    expect(
      predictDungeonCommand(state, {
        command: { kind: "expandStub", stubId: "stub-1" },
      })
    ).toEqual({ ok: true, value: state })
    expect(
      predictDungeonCommand(state, {
        command: {
          kind: "expandStub",
          stubId: "stub-1",
          forcedTemplateKey: "vault",
        },
      })
    ).toEqual({ ok: true, value: state })
    expect(
      predictDungeonCommand(state, {
        command: {
          kind: "declareSite",
          templateKey: "vault",
          minDepth: 3,
        },
      })
    ).toEqual({ ok: true, value: state })
    expect(
      predictDungeonCommand(state, {
        command: { kind: "retractZone", zoneId: "z1" },
      })
    ).toEqual({ ok: true, value: state })
  })

  it("round-trips the expand and retract command shapes through the args schema", () => {
    const expand = dungeonCommand({
      dungeonId: "dungeon-1",
      command: {
        kind: "expandStub",
        stubId: "stub-1",
        forcedTemplateKey: "vault",
      },
    })
    expect(expand.args).toEqual({
      dungeonId: "dungeon-1",
      command: {
        kind: "expandStub",
        stubId: "stub-1",
        forcedTemplateKey: "vault",
      },
    })
    const retract = dungeonCommand({
      dungeonId: "dungeon-1",
      command: { kind: "retractZone", zoneId: "z1" },
    })
    expect(retract.args).toEqual({
      dungeonId: "dungeon-1",
      command: { kind: "retractZone", zoneId: "z1" },
    })
  })

  it("puts only declaration intent on start and active force-place wires", () => {
    const start = dungeonCommand({
      dungeonId: "dungeon-1",
      command: {
        kind: "start",
        placements: [],
        siteDeclarations: [
          { templateKey: "vault", minDepth: 2, urgency: "session" },
        ],
      },
    })
    expect(start.args.command).toEqual({
      kind: "start",
      placements: [],
      siteDeclarations: [
        { templateKey: "vault", minDepth: 2, urgency: "session" },
      ],
    })
    expect(JSON.stringify(start.args)).not.toMatch(
      /secretIndex|qualifyingCount|sequence|"k"|"id"/
    )

    expect(
      dungeonCommand({
        dungeonId: "dungeon-1",
        command: { kind: "declareSite", templateKey: "vault", minDepth: 4 },
      }).args.command
    ).toEqual({
      kind: "declareSite",
      templateKey: "vault",
      minDepth: 4,
    })
    expect(
      dungeonCommand({
        dungeonId: "dungeon-1",
        command: {
          kind: "expandStub",
          stubId: "stub-1",
          forcePlaceTemplateKey: "vault",
        },
      }).args.command
    ).toEqual({
      kind: "expandStub",
      stubId: "stub-1",
      forcePlaceTemplateKey: "vault",
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
