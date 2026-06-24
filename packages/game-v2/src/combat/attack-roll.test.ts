import { describe, expect, it } from "vitest"

import {
  resolveAttackAttribute,
  resolveAttackRoll,
  resolveAttackRollFrom,
  type AttackRollContext,
} from "@workspace/game-v2/combat/attack-roll"
import type {
  PartyComposition,
  ScalerContext,
} from "@workspace/game-v2/combat/party"
import type { AttackRollEffect } from "@workspace/game-v2/kernel/effects.schema"
import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { AttributeScores, Lineage } from "@workspace/game-v2/kernel/vocab"

// Skills aren't ported yet (PR5), so these reproduce v1's skill-sourced cases with
// fixture **effects** fed through `pendingEffects` — the resolver is effect-driven,
// so the source (mechanic / passive skill / zone) is irrelevant to the math.
const WARRIOR: AttributeScores = { strength: 2, magic: -1, agility: 1, luck: 1 }
const MAGE: AttributeScores = { strength: -1, magic: 2, agility: 1, luck: 1 }

function resolved(
  attributes: AttributeScores,
  attackRoll: AttackRollEffect[] = []
): ResolvedEntity {
  return {
    id: "fx",
    components: { attributes, pendingEffects: { attackRoll, damage: [] } },
  }
}

const scaler = (
  partyComposition: PartyComposition | null,
  activeLineage: Lineage | null
): ScalerContext => ({ partyComposition, activeLineage })

const SLASH_ST: AttackRollContext = {
  kind: "attack",
  damageType: "slash",
  delivery: "physical",
  attribute: "st",
}
const PIERCE_ST: AttackRollContext = {
  kind: "attack",
  damageType: "pierce",
  delivery: "physical",
  attribute: "st",
}
const FIRE_MAGICAL_MA: AttackRollContext = {
  kind: "attack",
  damageType: "fire",
  delivery: "magical",
  attribute: "ma",
}
const FIRE_PHYSICAL_ST: AttackRollContext = {
  kind: "attack",
  damageType: "fire",
  delivery: "physical",
  attribute: "st",
}
const AILMENT_LU: AttackRollContext = { kind: "ailment", attribute: "lu" }

const slashBoost: AttackRollEffect = {
  type: "attackRoll",
  when: { damageTypes: ["slash"] },
  amount: 2,
  source: "Slash Boost",
}
const ailmentBoost: AttackRollEffect = {
  type: "attackRoll",
  when: { skillKinds: ["ailment"] },
  amount: 2,
  source: "Ailment Boost",
}
const magicCircle = (
  includesSelf: boolean,
  source = "Magic Circle"
): AttackRollEffect => ({
  type: "attackRoll",
  when: { deliveries: ["magical"] },
  scaler: { kind: "perPartyLineage", lineage: "mage", amount: 1, includesSelf },
  source,
})

describe("resolveAttackAttribute (C2)", () => {
  it("maps each symbol 1:1; st-or-ma picks the higher of Strength/Magic", () => {
    expect(resolveAttackAttribute("st", WARRIOR)).toBe(2)
    expect(resolveAttackAttribute("ma", WARRIOR)).toBe(-1)
    expect(resolveAttackAttribute("ag", WARRIOR)).toBe(1)
    expect(resolveAttackAttribute("lu", WARRIOR)).toBe(1)
    expect(resolveAttackAttribute("st-or-ma", WARRIOR)).toBe(2)
    expect(resolveAttackAttribute("st-or-ma", MAGE)).toBe(2)
  })
})

describe("resolveAttackRollFrom (pure core)", () => {
  it("C1: the rolling Attribute is always sources[0], even when negative", () => {
    expect(
      resolveAttackRollFrom(FIRE_MAGICAL_MA, WARRIOR, [], () => 0)
    ).toEqual({ total: -1, sources: [{ source: "Magic", amount: -1 }] })
  })

  it("C4: a 0-resolving effect contributes nothing and produces no source row", () => {
    const zero: AttackRollEffect = {
      type: "attackRoll",
      amount: 0,
      source: "Zero",
    }
    expect(
      resolveAttackRollFrom(SLASH_ST, WARRIOR, [zero], (e) => e.amount ?? 0)
    ).toEqual({ total: 2, sources: [{ source: "Strength", amount: 2 }] })
  })

  it("C5: an effect with no source label is labelled 'Bonus'", () => {
    const unsourced: AttackRollEffect = { type: "attackRoll", amount: 3 }
    const { sources } = resolveAttackRollFrom(
      SLASH_ST,
      WARRIOR,
      [unsourced],
      () => 3
    )
    expect(sources).toContainEqual({ source: "Bonus", amount: 3 })
  })

  it("C3: total = Attribute + every matching contribution, in collection order", () => {
    const a: AttackRollEffect = {
      type: "attackRoll",
      amount: 3,
      source: "First",
    }
    const b: AttackRollEffect = {
      type: "attackRoll",
      amount: 2,
      source: "Second",
    }
    const resolvedRoll = resolveAttackRollFrom(
      SLASH_ST,
      WARRIOR,
      [a, b],
      (e) => e.amount ?? 0
    )
    expect(resolvedRoll.total).toBe(7)
    expect(resolvedRoll.sources).toEqual([
      { source: "Strength", amount: 2 },
      { source: "First", amount: 3 },
      { source: "Second", amount: 2 },
    ])
  })
})

describe("resolveAttackRoll — filter axes (C7)", () => {
  it("damageTypes: matches Slash, ignores Pierce", () => {
    const entity = resolved(WARRIOR, [slashBoost])
    expect(resolveAttackRoll(SLASH_ST, entity, null)).toEqual({
      total: 4,
      sources: [
        { source: "Strength", amount: 2 },
        { source: "Slash Boost", amount: 2 },
      ],
    })
    expect(resolveAttackRoll(PIERCE_ST, entity, null)).toEqual({
      total: 2,
      sources: [{ source: "Strength", amount: 2 }],
    })
  })

  it("deliveries: magical matches, physical does not", () => {
    const entity = resolved(MAGE, [magicCircle(true)])
    expect(
      resolveAttackRoll(FIRE_MAGICAL_MA, entity, scaler({ mage: 2 }, "mage"))
    ).toEqual({
      total: 4,
      sources: [
        { source: "Magic", amount: 2 },
        { source: "Magic Circle", amount: 2 },
      ],
    })
    expect(
      resolveAttackRoll(FIRE_PHYSICAL_ST, entity, scaler({ mage: 2 }, "mage"))
    ).toEqual({ total: -1, sources: [{ source: "Strength", amount: -1 }] })
  })

  it("skillKinds: ailment matches, attack does not", () => {
    const entity = resolved(WARRIOR, [ailmentBoost])
    expect(resolveAttackRoll(AILMENT_LU, entity, null)).toEqual({
      total: 3,
      sources: [
        { source: "Luck", amount: 1 },
        { source: "Ailment Boost", amount: 2 },
      ],
    })
    expect(resolveAttackRoll(SLASH_ST, entity, null)).toEqual({
      total: 2,
      sources: [{ source: "Strength", amount: 2 }],
    })
  })

  it("a present filter fails on a context whose axis value is undefined (ailment has no damageType)", () => {
    const entity = resolved(WARRIOR, [slashBoost])
    expect(resolveAttackRoll(AILMENT_LU, entity, null)).toEqual({
      total: 1,
      sources: [{ source: "Luck", amount: 1 }],
    })
  })

  it("C13: an unfiltered context effect applies to every kind, incl. ailment", () => {
    const toccata: AttackRollEffect = {
      type: "attackRoll",
      amount: 3,
      source: "Toccata",
    }
    const entity = resolved(WARRIOR, [toccata])
    expect(resolveAttackRoll(AILMENT_LU, entity, null).sources).toContainEqual({
      source: "Toccata",
      amount: 3,
    })
  })
})

describe("resolveAttackRoll — perPartyLineage scaler (C8/C9)", () => {
  it("multiplies the per-ally amount by the lineage count", () => {
    const entity = resolved(MAGE, [magicCircle(true)])
    expect(
      resolveAttackRoll(FIRE_MAGICAL_MA, entity, scaler({ mage: 3 }, "mage"))
        .total
    ).toBe(5)
  })

  it("contributes 0 when the lineage is absent from the composition", () => {
    const entity = resolved(MAGE, [magicCircle(true)])
    expect(
      resolveAttackRoll(FIRE_MAGICAL_MA, entity, scaler({ warrior: 4 }, "mage"))
    ).toEqual({
      total: 2,
      sources: [{ source: "Magic", amount: 2 }],
    })
  })

  it("treats a null scaler context (enemy / no party) as zero allies", () => {
    const entity = resolved(MAGE, [magicCircle(true)])
    expect(resolveAttackRoll(FIRE_MAGICAL_MA, entity, null)).toEqual({
      total: 2,
      sources: [{ source: "Magic", amount: 2 }],
    })
  })

  const mcAmount = (ctx: ScalerContext | null) =>
    resolveAttackRoll(
      FIRE_MAGICAL_MA,
      resolved(MAGE, [magicCircle(false, "MC")]),
      ctx
    ).sources.find((s) => s.source === "MC")?.amount

  it("subtracts self when includesSelf is false and activeLineage matches", () => {
    expect(mcAmount(scaler({ mage: 3 }, "mage"))).toBe(2)
  })

  it("does not subtract self when activeLineage is null", () => {
    expect(mcAmount(scaler({ mage: 3 }, null))).toBe(3)
  })

  it("does not subtract self when activeLineage differs", () => {
    expect(mcAmount(scaler({ mage: 3 }, "warrior"))).toBe(3)
  })
})
