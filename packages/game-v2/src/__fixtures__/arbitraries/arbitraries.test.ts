import fc from "fast-check"
import { describe, expect, it } from "vitest"

import { arbitraryEntity } from "@workspace/game-v2/__fixtures__/arbitraries/entity"
import { HOSTILE_VOCAB } from "@workspace/game-v2/__fixtures__/arbitraries/vocab"
import { loadEntity } from "@workspace/game-v2/kernel/load-seam"
import { TALENT_KEYS } from "@workspace/game-v2/talents/vocab"

/**
 * The **meta-property**: the generator cannot drift from the schemas it claims to
 * inhabit. Without this, a law quantified over `arbitraryEntity` would silently
 * shrink its own domain the day a schema tightened — the property would still be
 * green, and would mean less.
 */
const VOCAB = {
  archetypeKeys: ["knight", "mage", "thief"],
  skillKeys: ["cleave", "agi"],
  itemKeys: ["iron-sword", "potion"],
  talentKeys: [...TALENT_KEYS],
  inlineSkills: [],
}

describe("arbitraryEntity", () => {
  it("generates only bags that parse through the load seam", () => {
    fc.assert(
      fc.property(arbitraryEntity({ vocab: VOCAB }), (entity) => {
        const loaded = loadEntity(entity.id, entity.components)
        expect(loaded.ok).toBe(true)
      })
    )
  })

  it("generates bags that are fixed points of the load seam", () => {
    fc.assert(
      fc.property(arbitraryEntity({ vocab: VOCAB }), (entity) => {
        const loaded = loadEntity(entity.id, entity.components)
        if (!loaded.ok) throw new Error("bag failed to load")
        expect(loaded.value).toStrictEqual(entity)
      })
    )
  })

  it("generates bags that survive a jsonb round-trip unchanged", () => {
    fc.assert(
      fc.property(arbitraryEntity({ vocab: VOCAB }), (entity) => {
        const stored: unknown = JSON.parse(JSON.stringify(entity.components))
        const loaded = loadEntity(entity.id, stored)
        if (!loaded.ok) throw new Error("stored bag failed to load")
        expect(loaded.value).toStrictEqual(entity)
      })
    )
  })

  it("generates hostile bags that still parse — shape is not reference", () => {
    fc.assert(
      fc.property(arbitraryEntity({ vocab: HOSTILE_VOCAB }), (entity) => {
        expect(loadEntity(entity.id, entity.components).ok).toBe(true)
      })
    )
  })

  it("always carries the required components", () => {
    fc.assert(
      fc.property(
        arbitraryEntity({ vocab: VOCAB, require: ["vitals", "level", "path"] }),
        (entity) => {
          expect(entity.components.vitals).toBeDefined()
          expect(entity.components.level).toBeDefined()
          expect(entity.components.path).toBeDefined()
        }
      )
    )
  })
})
