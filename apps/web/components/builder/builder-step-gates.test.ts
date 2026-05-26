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

  describe("unknown step slugs", () => {
    it("never blocks an unrecognized slug — only enumerated movements gate", () => {
      // Placeholder slugs for movements not yet shipped (UNN-216 Ortus,
      // UNN-217 Animus) and the route's fallback all permissively advance.
      expect(nextGateForStep("ortus", validCharacter()).canAdvance).toBe(true)
      expect(nextGateForStep("animus", validCharacter()).canAdvance).toBe(true)
      expect(
        nextGateForStep("not-a-real-step", validCharacter()).canAdvance
      ).toBe(true)
    })
  })
})

describe("findStepGateFailures", () => {
  it("returns an empty list when every gate passes", () => {
    expect(findStepGateFailures(validCharacter())).toEqual([])
  })

  it("returns one failure per failing movement, in wizard order", () => {
    const failures = findStepGateFailures(
      validCharacter({ name: "", originArchetypeKey: null })
    )
    expect(failures.map((f) => f.stepSlug)).toEqual(["corpus", "persona"])
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
