import { describe, expect, it } from "vitest"

import { resolveEntity } from "@/domain/game-engine-v2"

import {
  SEED_CHARACTERS,
  seedCharacterToEntity,
} from "../__fixtures__/seed-characters"

/**
 * **Real-catalog derivation guard (UNN-562 S4).** The v2 engine's own
 * derivation math is pinned with hand-verified numbers by
 * `packages/game-v2`'s `resolve.integration.test.ts` — but those are
 * *fixture*-backed by design (the engine is independence- and fixture-first).
 * The one thing they can't catch is a broken **production catalog** entry (a
 * typo in an archetype's HP formula, a wiped affinity table), because they
 * never touch it.
 *
 * This suite closes that gap without freezing brittle full-output snapshots:
 * it runs the real `resolveEntity` over the real seed roster and asserts
 * *behavioral invariants* — resolves cleanly, pools scale with level, a manual
 * bonus lands, the active Archetype resolves. A production-catalog regression
 * that unit tests miss (and that an e2e "it renders" wouldn't flag) fails here.
 */

const bySlug = (slug: string) => {
  const seed = SEED_CHARACTERS.find((s) => s.slug === slug)
  if (!seed) throw new Error(`no seed '${slug}'`)
  return seed
}

const componentsOf = (seed: ReturnType<typeof bySlug>) =>
  resolveEntity(seedCharacterToEntity(seed)).components

describe("v2 derivation over the real catalog", () => {
  it("resolves every seed cleanly, emitting the core read-units", () => {
    for (const seed of SEED_CHARACTERS) {
      const c = componentsOf(seed)
      expect(c.attributes, seed.slug).toBeDefined()
      expect(c.affinities, seed.slug).toBeDefined()
      expect(c.vitals?.maxHP, seed.slug).toBeGreaterThan(0)
      expect(c.skillPool?.maxSP, seed.slug).toBeGreaterThan(0)
      expect(c.resources?.maxHitDice, seed.slug).toBeGreaterThanOrEqual(1)
      expect(c.resources?.maxSkillDice, seed.slug).toBeGreaterThanOrEqual(1)
    }
  })

  it("resolves each seed's active Archetype to its authored key", () => {
    for (const seed of SEED_CHARACTERS) {
      expect(componentsOf(seed).archetypes?.active, seed.slug).toBe(
        seed.activeArchetypeKey
      )
    }
  })

  it("scales max pools with level (L1 warrior < L13 mage < L30 fallen)", () => {
    const maxHP = (slug: string) => componentsOf(bySlug(slug)).vitals!.maxHP
    expect(maxHP("warrior")).toBeLessThan(maxHP("mage"))
    expect(maxHP("mage")).toBeLessThan(maxHP("fallen"))
  })

  it("lands a manual attribute bonus on the resolved attribute (Calliope: +1 magic)", () => {
    // seed-mage carries `manualBonuses: { magic: 1 }`; dropping it must lower
    // the resolved magic attribute by exactly that flat bonus (rulebook 2.4).
    const mage = bySlug("mage")
    const withBonus = componentsOf(mage).attributes!.magic
    const withoutBonus = resolveEntity(
      seedCharacterToEntity({ ...mage, manualBonuses: {} })
    ).components.attributes!.magic
    expect(withBonus).toBe(withoutBonus + 1)
  })
})
