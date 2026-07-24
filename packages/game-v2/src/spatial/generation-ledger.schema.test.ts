import { describe, expect, it } from "vitest"

import { dungeonStateSchema } from "./dungeon.schema"
import {
  emptyGenerationLedger,
  generationLedgerSchema,
} from "./generation-ledger.schema"

const consumedStub = {
  id: "stub-1",
  zoneId: "zone-parent",
  bearing: 0.5,
  anchor: { side: "e", offset: 0.5 },
}

describe("generationLedgerSchema", () => {
  it("parses {} to the zero ledger", () => {
    expect(generationLedgerSchema.parse({})).toStrictEqual({
      seed: "",
      streamCursors: {},
      declarations: [],
      mintedUniqueKeys: [],
      mints: {},
    })
    expect(emptyGenerationLedger()).toStrictEqual(
      generationLedgerSchema.parse({})
    )
  })

  it("is a fixed point (parse ∘ parse === parse)", () => {
    const once = generationLedgerSchema.parse({
      seed: "expedition-seed",
      streamCursors: { templates: 3 },
      declarations: [
        { id: "d1", sequence: 0, templateKey: "vault", k: 6, secretIndex: 4 },
      ],
      mintedUniqueKeys: ["castle-entrance"],
      mints: {
        "zone-1": {
          sequence: 0,
          templateKey: "hall",
          unique: false,
          stub: consumedStub,
          childStubIds: [],
        },
      },
    })
    expect(generationLedgerSchema.parse(once)).toStrictEqual(once)
  })

  it("defaults declaration counters and mint effects", () => {
    const ledger = generationLedgerSchema.parse({
      declarations: [
        { id: "d1", sequence: 0, templateKey: "vault", k: 6, secretIndex: 1 },
      ],
      mints: {
        z: {
          sequence: 1,
          templateKey: "hall",
          unique: true,
          stub: consumedStub,
          childStubIds: ["child-1"],
        },
      },
    })
    expect(ledger.declarations[0]).toMatchObject({
      minDepth: 0,
      qualifyingCount: 0,
    })
    expect(ledger.mints.z!.effects).toStrictEqual([])
  })

  it("rejects a negative stream cursor", () => {
    expect(() =>
      generationLedgerSchema.parse({ streamCursors: { templates: -1 } })
    ).toThrow()
  })

  it("rejects out-of-range hidden indices and duplicate live declaration keys", () => {
    expect(() =>
      generationLedgerSchema.parse({
        declarations: [
          {
            id: "d1",
            sequence: 0,
            templateKey: "vault",
            k: 2,
            secretIndex: 3,
          },
        ],
      })
    ).toThrow()
    expect(() =>
      generationLedgerSchema.parse({
        declarations: [
          {
            id: "d1",
            sequence: 0,
            templateKey: "vault",
            k: 2,
            secretIndex: 1,
          },
          {
            id: "d2",
            sequence: 1,
            templateKey: "vault",
            k: 2,
            secretIndex: 1,
          },
        ],
      })
    ).toThrow()
  })
})

describe("dungeonStateSchema — generation", () => {
  it("heals a pre-P3 dungeon blob (no generation key) with the zero ledger", () => {
    const parsed = dungeonStateSchema.parse({
      turnCounter: 12,
      actedCharacterIds: ["c1"],
    })
    expect(parsed.generation).toStrictEqual(emptyGenerationLedger())
  })

  it("stays a fixed point with a populated ledger", () => {
    const once = dungeonStateSchema.parse({
      generation: { seed: "s", streamCursors: { draws: 2 } },
    })
    expect(dungeonStateSchema.parse(once)).toStrictEqual(once)
  })
})
