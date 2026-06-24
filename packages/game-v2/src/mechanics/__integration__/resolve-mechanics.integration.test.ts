import { describe, expect, it } from "vitest"

import type { CombatantEffect } from "@workspace/game-v2/kernel/effects.schema"
import {
  makeArchetype,
  makeDerivedEntity,
  makeFlatEntity,
  makeTestGameData,
} from "@workspace/game-v2/resolve/__fixtures__/derive"
import { createResolve } from "@workspace/game-v2/resolve/resolve"
import { createResolveEntity } from "@workspace/game-v2/resolve/resolve-entity"

/**
 * Collaboration tests for the layer-5 mechanic fold (UNN-502): `resolveEntity`
 * reads the active mechanic and routes its effects through the base `resolve` —
 * affinity overrides land in the resolved chart (live consumer today), while
 * attack-roll/damage effects surface in `pendingEffects` for the PR7 resolvers.
 * Fixture-backed: the archetype→mechanic mapping is authored here (no real catalog
 * exists until PR6).
 */

const data = makeTestGameData({
  warrior: makeArchetype({ mechanic: "perfection" }),
  knight: makeArchetype({ mechanic: "valor" }),
  berserker: makeArchetype({ mechanic: "frenzy" }),
  scholar: makeArchetype(), // no mechanic
})
const resolveEntity = createResolveEntity(data)

describe("resolveEntity — the active mechanic reaches resolve", () => {
  it("folds Valor's affinity override into the resolved chart (≥3)", () => {
    const resolved = resolveEntity(
      makeDerivedEntity({
        active: "knight",
        mechanics: { valor: { kind: "valor", value: 4 } },
      })
    )
    expect(resolved.components.affinities?.slash).toBe("resist")
    expect(resolved.components.affinities?.pierce).toBe("resist")
    expect(resolved.components.affinities?.strike).toBe("resist")
    // unrelated type untouched
    expect(resolved.components.affinities?.fire).toBe("neutral")
    // affinity is consumed in-fold, not surfaced as a pending effect
    expect(resolved.components.pendingEffects).toBeUndefined()
  })

  it("surfaces Perfection's attack-roll bonus in pendingEffects with its source", () => {
    const resolved = resolveEntity(
      makeDerivedEntity({
        active: "warrior",
        mechanics: { perfection: { kind: "perfection", rank: 3 } },
      })
    )
    expect(resolved.components.pendingEffects?.attackRoll).toEqual([
      { type: "attackRoll", amount: 3, source: "Perfection (A)" },
    ])
    expect(resolved.components.pendingEffects?.damage).toEqual([])
  })

  it("surfaces Frenzy's damage bonus in pendingEffects with its source", () => {
    const resolved = resolveEntity(
      makeDerivedEntity({
        active: "berserker",
        mechanics: { frenzy: { kind: "frenzy", pain: 2, frenzyMode: true } },
      })
    )
    expect(resolved.components.pendingEffects?.damage).toEqual([
      {
        type: "damage",
        when: { deliveries: ["physical"] },
        dice: { count: 2, sides: 4 },
        source: "Frenzy (Pain 2)",
      },
    ])
    expect(resolved.components.pendingEffects?.attackRoll).toEqual([])
  })

  it("coerces an absent-but-owned mechanic state to its initial state (Perfection at D ⇒ no effect)", () => {
    const resolved = resolveEntity(makeDerivedEntity({ active: "warrior" }))
    expect(resolved.components.pendingEffects).toBeUndefined()
  })

  it("applies only the ACTIVE Archetype's mechanic — a persisted inactive state does nothing (D36)", () => {
    const resolved = resolveEntity(
      makeDerivedEntity({
        active: "scholar", // active Archetype owns no mechanic
        mechanics: { valor: { kind: "valor", value: 7 } },
      })
    )
    expect(resolved.components.affinities?.slash).toBe("neutral")
    expect(resolved.components.pendingEffects).toBeUndefined()
  })

  it("merges caller context effects (e.g. a Zone Enchantment) with the mechanic's", () => {
    const resolved = resolveEntity(
      makeDerivedEntity({
        active: "warrior",
        mechanics: { perfection: { kind: "perfection", rank: 1 } },
      }),
      { effects: [{ type: "attackRoll", amount: 2, source: "Toccata" }] }
    )
    expect(resolved.components.pendingEffects?.attackRoll).toEqual([
      { type: "attackRoll", amount: 1, source: "Perfection (C)" },
      { type: "attackRoll", amount: 2, source: "Toccata" },
    ])
  })
})

describe("resolveEntity — enemy mechanics are always on (no archetype gating, D36)", () => {
  it("applies a mechanic carried by an entity with no Archetypes component", () => {
    const resolved = resolveEntity(
      makeFlatEntity({
        affinities: { slash: "weak" },
        mechanics: { valor: { kind: "valor", value: 4 } },
      })
    )
    // Valor's resist applies with no active Archetype to gate it (strongest-wins
    // over the authored Weak base).
    expect(resolved.components.affinities?.slash).toBe("resist")
  })

  it("applies every carried mechanic at once (a Nyx-style enemy may hold several)", () => {
    const resolved = resolveEntity(
      makeFlatEntity({
        mechanics: {
          valor: { kind: "valor", value: 3 },
          frenzy: { kind: "frenzy", pain: 2, frenzyMode: true },
        },
      })
    )
    expect(resolved.components.affinities?.slash).toBe("resist") // Valor
    expect(resolved.components.pendingEffects?.damage).toEqual([
      {
        type: "damage",
        when: { deliveries: ["physical"] },
        dice: { count: 2, sides: 4 },
        source: "Frenzy (Pain 2)",
      },
    ]) // Frenzy
  })

  it("an enemy with no Mechanics component resolves cleanly", () => {
    expect(
      resolveEntity(makeFlatEntity({})).components.pendingEffects
    ).toBeUndefined()
  })
})

describe("affinity candidate order is inert (resolve folds by strongest, not later-wins)", () => {
  it("two competing affinity candidates resolve the same regardless of order", () => {
    const resolve = createResolve(makeTestGameData())
    const entity = makeDerivedEntity({ active: null })
    const a: CombatantEffect = {
      type: "affinity",
      damageTypes: ["fire"],
      affinity: "resist",
    }
    const b: CombatantEffect = {
      type: "affinity",
      damageTypes: ["fire"],
      affinity: "weak",
    }

    const forward = resolve(entity, { effects: [a, b] })
    const reversed = resolve(entity, { effects: [b, a] })
    expect(forward.components.affinities?.fire).toBe(
      reversed.components.affinities?.fire
    )
  })
})
