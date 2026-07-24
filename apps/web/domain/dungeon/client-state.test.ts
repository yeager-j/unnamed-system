import { describe, expect, it } from "vitest"

import { createDungeonState } from "@workspace/game-v2/spatial"

import {
  foundObjectiveZoneId,
  projectDungeonClientState,
  type PublicSiteDeclaration,
} from "./client-state"

describe("foundObjectiveZoneId", () => {
  const resolved = {
    id: "declaration-1",
    templateKey: "vault",
    minDepth: 2,
    resolvedZoneId: "zone-vault",
  } satisfies PublicSiteDeclaration

  it("does not count a pre-generated but unrevealed site as found", () => {
    expect(foundObjectiveZoneId(resolved, new Set())).toBeUndefined()
  })

  it("returns the resolved Zone only after players reveal it", () => {
    expect(foundObjectiveZoneId(resolved, new Set(["zone-vault"]))).toBe(
      "zone-vault"
    )
  })
})

describe("projectDungeonClientState", () => {
  it("omits every private P4a generation value from serialized client canon", () => {
    const state = createDungeonState()
    state.generation = {
      seed: "PRIVATE_SEED_SENTINEL",
      streamCursors: { draws: 73, layout: 91 },
      declarations: [
        {
          id: "public-declaration-id",
          sequence: 41,
          templateKey: "vault",
          minDepth: 3,
          k: 15,
          secretIndex: 11,
          qualifyingCount: 7,
        },
      ],
      mintedUniqueKeys: ["spent-site"],
      mints: {
        PRIVATE_MINT_KEY_SENTINEL: {
          sequence: 9,
          templateKey: "hall",
          unique: false,
          stub: {
            id: "stub",
            zoneId: "parent",
            bearing: 0,
            anchor: { side: "e", offset: 0.5 },
          },
          childStubIds: [],
          effects: [],
        },
      },
    }

    const serialized = JSON.stringify(projectDungeonClientState(state))

    expect(JSON.parse(serialized)).toEqual({
      turnCounter: 0,
      actedCharacterIds: [],
      reminderSettings: state.reminderSettings,
      generation: {
        declarations: [
          {
            id: "public-declaration-id",
            templateKey: "vault",
            minDepth: 3,
          },
        ],
        mintedUniqueKeys: ["spent-site"],
      },
    })
    expect(serialized).not.toMatch(
      /PRIVATE_|seed|streamCursors|mints|sequence|secretIndex|qualifyingCount|"k"/
    )
  })
})
