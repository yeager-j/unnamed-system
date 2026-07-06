import { describe, expect, it } from "vitest"

import { getAilment as v2GetAilment } from "@workspace/game-v2/encounter"
import { getTalent as v2GetTalent } from "@workspace/game-v2/talents"
import {
  AILMENTS as V1_AILMENTS,
  TALENTS as V1_TALENTS,
} from "@workspace/game/data"

/**
 * Byte-identity parity gate for the CH10 content move (UNN-554): the talent + ailment
 * display catalogs now live in `packages/game-v2` (engine-owned), copied verbatim from
 * the v1 registries. This cross-package check asserts the v2 catalogs are byte-for-byte
 * identical to v1 — it can only live here in `apps/web`, since game-v2 may not import v1
 * (the D32 independence gate). Temporary: it dies at S4 when the v1 oracle is deleted.
 */
describe("talent catalog parity (v2 vs v1)", () => {
  it("reproduces every v1 talent name byte-for-byte, no key dropped", () => {
    expect(V1_TALENTS.length).toBeGreaterThan(0)
    for (const v1 of V1_TALENTS) {
      const v2 = v2GetTalent(v1.key)
      expect(v2, `talent "${v1.key}" missing from v2`).toBeDefined()
      expect(v2?.name).toBe(v1.name)
    }
  })
})

describe("ailment catalog parity (v2 vs v1)", () => {
  it("reproduces every v1 ailment name + description byte-for-byte, no key dropped", () => {
    expect(V1_AILMENTS.length).toBeGreaterThan(0)
    for (const v1 of V1_AILMENTS) {
      const v2 = v2GetAilment(v1.key)
      expect(v2, `ailment "${v1.key}" missing from v2`).toBeDefined()
      expect(v2?.name).toBe(v1.name)
      expect(v2?.description).toBe(v1.description)
    }
  })
})
