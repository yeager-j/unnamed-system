import { describe, expect, it } from "vitest"

import { exhaustionWriter, levelWriter, restWriter } from "./character"

describe("restWriter", () => {
  it("preserves the rest transition's multi-component patch", () => {
    expect(
      restWriter.applyOp(
        {
          vitals: { base: 0, damage: 2 },
          skillPool: { base: 0, spSpent: 1 },
          resources: { hitDiceUsed: 1, skillDiceUsed: 1, prismaUsed: 0 },
          exhaustion: { level: 2 },
          level: { value: 4, victories: 0 },
        },
        { component: "rest", op: "fullRest" }
      )
    ).toEqual({
      ok: true,
      value: {
        vitals: { base: 0, damage: 0 },
        skillPool: { base: 0, spSpent: 0 },
        resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 0 },
        exhaustion: { level: 1 },
      },
    })
  })
})

describe("exhaustionWriter", () => {
  it("writes exhaustion without routing through the registry", () => {
    expect(
      exhaustionWriter.applyOp(
        { exhaustion: { level: 1 } },
        { component: "exhaustion", op: "setLevel", level: 4 }
      )
    ).toEqual({ ok: true, value: { exhaustion: { level: 4 } } })
  })
})

describe("levelWriter", () => {
  it("keeps leveling in the progression class", () => {
    expect(levelWriter.durableClass).toBe("progression")
  })
})
