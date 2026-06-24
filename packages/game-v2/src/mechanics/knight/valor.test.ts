import { describe, expect, it } from "vitest"

import {
  adjustValor,
  valor,
  VALOR_MAX,
} from "@workspace/game-v2/mechanics/knight/valor"

const at = (value: number) => ({ kind: "valor", value }) as const

describe("Valor", () => {
  it("starts at 0", () => {
    expect(valor.initialState()).toEqual({ kind: "valor", value: 0 })
  })

  it("adjustValor clamps to 0..MAX", () => {
    expect(adjustValor(at(0), -1).value).toBe(0)
    expect(adjustValor(at(VALOR_MAX), 1).value).toBe(VALOR_MAX)
    expect(adjustValor(at(2), 2).value).toBe(4)
  })

  it("emits the slash/pierce/strike resist override only at value ≥ 3", () => {
    expect(valor.effects?.(at(2))).toEqual([])
    expect(valor.effects?.(at(3))).toEqual([
      {
        type: "affinity",
        damageTypes: ["slash", "pierce", "strike"],
        affinity: "resist",
        source: "Valor (3)",
      },
    ])
  })

  it("labels the source with the current value", () => {
    expect(valor.effects?.(at(VALOR_MAX))?.[0]?.source).toBe("Valor (7)")
  })
})
