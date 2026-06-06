import { describe, expect, it } from "vitest"

import { makeRawCharacterInputs } from "@workspace/game/engine/__fixtures__/character"
import { reduceProgressionEdit } from "@workspace/game/engine/character/reduce/progression"

describe("reduceProgressionEdit — victories", () => {
  it("banks victories by the delta", () => {
    const raw = makeRawCharacterInputs({ row: { victories: 3 } })
    expect(
      reduceProgressionEdit(raw, { kind: "victories", delta: 2 })?.row.victories
    ).toBe(5)
  })

  it("floors victories at 0", () => {
    const raw = makeRawCharacterInputs({ row: { victories: 1 } })
    expect(
      reduceProgressionEdit(raw, { kind: "victories", delta: -5 })?.row
        .victories
    ).toBe(0)
  })
})

describe("reduceProgressionEdit — addSpark", () => {
  it("appends a spark tagged with the chosen virtue, leaving virtue ranks untouched", () => {
    const raw = makeRawCharacterInputs({
      row: { sparkLog: ["wisdom"], virtueEmpathy: 1 },
    })

    const next = reduceProgressionEdit(raw, {
      kind: "addSpark",
      virtue: "focus",
    })

    expect(next?.row.sparkLog).toEqual(["wisdom", "focus"])
    expect(next?.row.virtueEmpathy).toBe(1)
    expect(next?.row.virtueExpression).toBe(0)
    expect(next?.row.virtueWisdom).toBe(0)
    expect(next?.row.virtueFocus).toBe(0)
  })

  it("is a no-op when the spark log is already full", () => {
    const fullLog = Array<"wisdom">(7).fill("wisdom")
    const raw = makeRawCharacterInputs({ row: { sparkLog: fullLog } })
    expect(
      reduceProgressionEdit(raw, { kind: "addSpark", virtue: "focus" })
    ).toBeNull()
  })
})

describe("reduceProgressionEdit — rankUpVirtue", () => {
  it("ranks up the chosen virtue and clears the spark log", () => {
    const fullLog = Array<"wisdom">(7).fill("wisdom")
    const raw = makeRawCharacterInputs({
      row: { sparkLog: fullLog, virtueWisdom: 2, virtueEmpathy: 1 },
    })

    const next = reduceProgressionEdit(raw, {
      kind: "rankUpVirtue",
      virtue: "wisdom",
    })

    expect(next?.row.virtueWisdom).toBe(3)
    expect(next?.row.sparkLog).toEqual([])
    expect(next?.row.virtueEmpathy).toBe(1)
    expect(next?.row.virtueExpression).toBe(0)
    expect(next?.row.virtueFocus).toBe(0)
  })

  it("is a no-op when the chosen virtue is absent from a full log", () => {
    const fullLog = Array<"wisdom">(7).fill("wisdom")
    const raw = makeRawCharacterInputs({ row: { sparkLog: fullLog } })
    expect(
      reduceProgressionEdit(raw, { kind: "rankUpVirtue", virtue: "focus" })
    ).toBeNull()
  })

  it("is a no-op when the log is not full", () => {
    const raw = makeRawCharacterInputs({ row: { sparkLog: ["wisdom"] } })
    expect(
      reduceProgressionEdit(raw, { kind: "rankUpVirtue", virtue: "wisdom" })
    ).toBeNull()
  })
})
