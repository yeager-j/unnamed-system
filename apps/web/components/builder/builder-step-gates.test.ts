import { describe, expect, it } from "vitest"

import {
  findStepGateFailures,
  nextGateForStep,
  type StepGateCharacter,
} from "./builder-step-gates"

/**
 * A canonical "everything is valid" character. Each test starts from this and
 * overrides only the fields it wants to test, so a future required-field
 * addition surfaces as a single TypeScript error here instead of N missing
 * properties across every test.
 */
function validCharacter(
  overrides: Partial<StepGateCharacter> = {}
): StepGateCharacter {
  return {
    name: "Astrid Vey",
    originArchetypeKey: "warrior",
    virtueExpression: 0,
    virtueEmpathy: 2,
    virtueWisdom: 1,
    virtueFocus: 1,
    knives: Array.from({ length: 4 }, (_, i) => ({
      id: `knife-${i}`,
      characterId: "char-1",
      title: `Knife ${i}`,
      description: null,
      order: i,
    })),
    chains: [
      {
        id: "chain-0",
        characterId: "char-1",
        title: "Chain",
        description: null,
        order: 0,
      },
    ],
    personalityTraits: "- Sharp",
    hopes: "- Find sister",
    dreams: "Build a school.",
    fears: "- Drowning",
    secrets: "- Can't read",
    ...overrides,
  }
}

describe("nextGateForStep", () => {
  describe("corpus", () => {
    it("blocks when no Origin is picked", () => {
      const result = nextGateForStep(
        "corpus",
        validCharacter({ originArchetypeKey: null })
      )
      expect(result.canAdvance).toBe(false)
      expect(result.canAdvance === false && result.reason).toMatch(/origin/i)
    })

    it("allows once Origin is set", () => {
      expect(nextGateForStep("corpus", validCharacter()).canAdvance).toBe(true)
    })
  })

  describe("ortus", () => {
    it("blocks an invalid Virtue allocation", () => {
      // Default-shape `validCharacter()` already has 1×+2 + 2×+1; perturb
      // it so we have two +2s, which violates the creation rule.
      const result = nextGateForStep(
        "ortus",
        validCharacter({ virtueExpression: 2, virtueEmpathy: 2 })
      )
      expect(result.canAdvance).toBe(false)
      expect(result.canAdvance === false && result.reason).toMatch(/virtue/i)
    })

    it("blocks an unfilled allocation", () => {
      expect(
        nextGateForStep(
          "ortus",
          validCharacter({
            virtueExpression: 0,
            virtueEmpathy: 0,
            virtueWisdom: 0,
            virtueFocus: 0,
          })
        ).canAdvance
      ).toBe(false)
    })

    it("allows the canonical creation allocation", () => {
      expect(nextGateForStep("ortus", validCharacter()).canAdvance).toBe(true)
    })
  })

  describe("persona", () => {
    it("blocks an empty name", () => {
      const result = nextGateForStep("persona", validCharacter({ name: "" }))
      expect(result.canAdvance).toBe(false)
      expect(result.canAdvance === false && result.reason).toMatch(/name/i)
    })

    it("blocks a whitespace-only name", () => {
      expect(
        nextGateForStep("persona", validCharacter({ name: "   " })).canAdvance
      ).toBe(false)
    })

    it("allows any non-whitespace name", () => {
      expect(nextGateForStep("persona", validCharacter()).canAdvance).toBe(true)
    })
  })

  describe("ungated slugs", () => {
    it("permissively advances for movements without a gate (e.g. Animus)", () => {
      // Movement 3 is intentionally ungated — the writer view is opt-in.
      expect(nextGateForStep("animus", validCharacter()).canAdvance).toBe(true)
    })
  })
})

describe("findStepGateFailures", () => {
  it("returns an empty list when every gate passes", () => {
    expect(findStepGateFailures(validCharacter())).toEqual([])
  })

  it("returns one failure per failing movement, in wizard order", () => {
    const failures = findStepGateFailures(
      validCharacter({
        name: "",
        originArchetypeKey: null,
        virtueExpression: 0,
        virtueEmpathy: 0,
        virtueWisdom: 0,
        virtueFocus: 0,
      })
    )
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
    const failures = findStepGateFailures(
      validCharacter({ originArchetypeKey: null })
    )
    expect(failures).toHaveLength(1)
    expect(failures[0]!.stepSlug).toBe("corpus")
  })
})
