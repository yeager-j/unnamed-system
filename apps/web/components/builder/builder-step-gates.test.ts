import { describe, expect, it } from "vitest"

import type { VirtueRanks } from "@workspace/game-v2/virtues"

import {
  findStepGateFailures,
  nextGateForStep,
  type StepGateInput,
} from "./builder-step-gates"

/**
 * A canonical "everything is valid" draft. Each test starts from this and
 * overrides only the slices it wants to test.
 */
function validDraft(overrides: {
  name?: string
  origin?: string | null
  ranks?: VirtueRanks
}): StepGateInput {
  const origin = overrides.origin === undefined ? "warrior" : overrides.origin
  return {
    name: overrides.name ?? "Astrid Vey",
    components: {
      virtues: {
        ranks: overrides.ranks ?? {
          expression: 0,
          empathy: 2,
          wisdom: 1,
          focus: 1,
        },
        sparkLog: [],
      },
      ...(origin === null
        ? {}
        : {
            archetypes: {
              active: origin,
              origin,
              savedArchetypeRanks: 0,
              roster: [{ key: origin, rank: 2, inheritanceSlots: [] }],
            },
          }),
    },
  }
}

describe("nextGateForStep", () => {
  describe("corpus", () => {
    it("blocks when no Origin is picked", () => {
      const result = nextGateForStep("corpus", validDraft({ origin: null }))
      expect(result.canAdvance).toBe(false)
      expect(result.canAdvance === false && result.reason).toMatch(/origin/i)
    })

    it("blocks when the archetypes component is entirely absent", () => {
      expect(
        nextGateForStep("corpus", { name: "Astrid", components: {} }).canAdvance
      ).toBe(false)
    })

    it("allows once Origin is set", () => {
      expect(nextGateForStep("corpus", validDraft({})).canAdvance).toBe(true)
    })
  })

  describe("ortus", () => {
    it("blocks an invalid Virtue allocation (two +2s)", () => {
      const result = nextGateForStep(
        "ortus",
        validDraft({
          ranks: { expression: 2, empathy: 2, wisdom: 1, focus: 1 },
        })
      )
      expect(result.canAdvance).toBe(false)
      expect(result.canAdvance === false && result.reason).toMatch(/virtue/i)
    })

    it("blocks an unfilled allocation", () => {
      expect(
        nextGateForStep(
          "ortus",
          validDraft({
            ranks: { expression: 0, empathy: 0, wisdom: 0, focus: 0 },
          })
        ).canAdvance
      ).toBe(false)
    })

    it("blocks when the virtues component is entirely absent", () => {
      expect(
        nextGateForStep("ortus", { name: "Astrid", components: {} }).canAdvance
      ).toBe(false)
    })

    it("allows the canonical creation allocation", () => {
      expect(nextGateForStep("ortus", validDraft({})).canAdvance).toBe(true)
    })
  })

  describe("persona", () => {
    it("blocks an empty name", () => {
      const result = nextGateForStep("persona", validDraft({ name: "" }))
      expect(result.canAdvance).toBe(false)
      expect(result.canAdvance === false && result.reason).toMatch(/name/i)
    })

    it("blocks a whitespace-only name", () => {
      expect(
        nextGateForStep("persona", validDraft({ name: "   " })).canAdvance
      ).toBe(false)
    })

    it("allows any non-whitespace name", () => {
      expect(nextGateForStep("persona", validDraft({})).canAdvance).toBe(true)
    })
  })

  describe("ungated slugs", () => {
    it("permissively advances for movements without a gate (e.g. Animus)", () => {
      expect(nextGateForStep("animus", validDraft({})).canAdvance).toBe(true)
    })
  })
})

describe("findStepGateFailures", () => {
  it("returns an empty list when every gate passes", () => {
    expect(findStepGateFailures(validDraft({}))).toEqual([])
  })

  it("returns one failure per failing movement, in wizard order", () => {
    const failures = findStepGateFailures({ name: "", components: {} })
    expect(failures.map((f) => f.stepSlug)).toEqual([
      "corpus",
      "ortus",
      "persona",
    ])
    for (const failure of failures) {
      expect(failure.reason).not.toEqual("")
    }
  })

  it("reports only the movements that fail", () => {
    const failures = findStepGateFailures(validDraft({ origin: null }))
    expect(failures).toHaveLength(1)
    expect(failures[0]!.stepSlug).toBe("corpus")
  })
})
