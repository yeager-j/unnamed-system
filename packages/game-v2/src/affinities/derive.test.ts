import { describe, expect, it } from "vitest"

import {
  affinityEffectChart,
  computeAffinityChart,
  resolveAffinity,
} from "@workspace/game-v2/affinities/derive"
import type { AffinityEffect } from "@workspace/game-v2/kernel"

const fire = (affinity: AffinityEffect["affinity"]): AffinityEffect => ({
  type: "affinity",
  damageTypes: ["fire"],
  affinity,
})

describe("resolveAffinity", () => {
  it("absent ⇒ neutral; Almighty always neutral", () => {
    expect(resolveAffinity({ fire: "weak" }, "fire")).toBe("weak")
    expect(resolveAffinity({ fire: "weak" }, "ice")).toBe("neutral")
    expect(resolveAffinity({ fire: "weak" }, "almighty")).toBe("neutral")
  })
})

describe("affinityEffectChart (effects → chart source)", () => {
  it("charts each effect's damage types", () => {
    expect(
      affinityEffectChart([
        { type: "affinity", damageTypes: ["fire", "ice"], affinity: "resist" },
      ])
    ).toEqual({ fire: "resist", ice: "resist" })
  })

  it("keeps the strongest when several effects touch one type", () => {
    expect(
      affinityEffectChart([fire("resist"), fire("drain"), fire("null")])
    ).toEqual({ fire: "drain" })
  })

  it("ignores non-affinity effects", () => {
    expect(
      affinityEffectChart([
        { type: "attribute", target: "strength", amount: 2 },
        fire("resist"),
      ])
    ).toEqual({ fire: "resist" })
  })

  it("is empty for no effects", () => {
    expect(affinityEffectChart([])).toEqual({})
  })
})

describe("computeAffinityChart (variadic strongest-wins, base included — UNN-502)", () => {
  const base = { fire: "weak", ice: "resist" } as const

  it("fills every damage type, Almighty/uncharted Neutral", () => {
    const chart = computeAffinityChart({})
    expect(chart.fire).toBe("neutral")
    expect(chart.almighty).toBe("neutral")
    expect(Object.keys(chart)).toHaveLength(12)
  })

  it("folds a lone source", () => {
    expect(computeAffinityChart(base).fire).toBe("weak")
  })

  it("treats an absent (undefined) source as no contribution", () => {
    expect(computeAffinityChart(base, undefined).fire).toBe("weak")
  })

  it("a stronger source upgrades a weaker one (gear covers a weakness)", () => {
    expect(computeAffinityChart(base, { fire: "resist" }).fire).toBe("resist")
  })

  it("a weaker source does NOT downgrade a stronger one (innate Null kept)", () => {
    expect(
      computeAffinityChart({ fire: "null" }, { fire: "resist" }).fire
    ).toBe("null")
    // a weaker immunity doesn't displace a stronger one, either
    expect(computeAffinityChart({ fire: "drain" }, { fire: "null" }).fire).toBe(
      "drain"
    )
  })

  it("picks the strongest across every source by priority (drain > … > weak)", () => {
    expect(
      computeAffinityChart(
        base,
        { fire: "resist" },
        affinityEffectChart([fire("drain"), fire("null")])
      ).fire
    ).toBe("drain")
  })
})
