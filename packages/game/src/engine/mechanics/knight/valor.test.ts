import { describe, expect, it } from "vitest"

import type { StatContext } from "@workspace/game/engine/character/stats/stats"
import {
  adjustValor,
  valor,
  VALOR_THRESHOLDS,
} from "@workspace/game/engine/mechanics/knight/valor"
import { VALOR_MAX } from "@workspace/game/foundation/mechanics/schema"

const baseStats: StatContext = {
  pathChoice: "balanced",
  level: 1,
  manualBonuses: {},
  activeArchetypeKey: "knight",
  archetypes: [{ key: "knight", rank: 1 }],
  equippedItems: [],
  activeSkills: [],
  activeMechanic: null,
}

describe("valor", () => {
  it("starts at 0", () => {
    expect(valor.initialState()).toEqual({ kind: "valor", value: 0 })
  })

  it("caps at 7 and exposes the documented thresholds", () => {
    expect(VALOR_MAX).toBe(7)
    expect(VALOR_THRESHOLDS).toEqual([1, 2, 3, 4, 5])
  })

  it("emits no Effect below value 3", () => {
    for (const value of [0, 1, 2]) {
      expect(
        valor.effects?.({ kind: "valor", value }, { stats: baseStats })
      ).toEqual([])
    }
  })

  it("emits a physical Resist affinity Effect at value 3+", () => {
    const effects = valor.effects?.(
      { kind: "valor", value: 3 },
      { stats: baseStats }
    )
    expect(effects).toEqual([
      {
        type: "affinity",
        damageTypes: ["slash", "pierce", "strike"],
        affinity: "resist",
        source: "Valor (3)",
      },
    ])
  })

  it("still emits at higher values, with the source reflecting the current value", () => {
    const effects = valor.effects?.(
      { kind: "valor", value: 7 },
      { stats: baseStats }
    )
    expect(effects?.[0]).toMatchObject({
      affinity: "resist",
      source: "Valor (7)",
    })
  })
})

describe("adjustValor", () => {
  it("increments and decrements in unit steps", () => {
    expect(adjustValor({ kind: "valor", value: 2 }, 1)).toEqual({
      kind: "valor",
      value: 3,
    })
    expect(adjustValor({ kind: "valor", value: 4 }, -1)).toEqual({
      kind: "valor",
      value: 3,
    })
  })

  it("clamps at 0 on decrement", () => {
    expect(adjustValor({ kind: "valor", value: 0 }, -1)).toEqual({
      kind: "valor",
      value: 0,
    })
  })

  it("clamps at VALOR_MAX on increment", () => {
    expect(adjustValor({ kind: "valor", value: VALOR_MAX }, 1)).toEqual({
      kind: "valor",
      value: VALOR_MAX,
    })
  })
})
