import { describe, expect, it } from "vitest"

import { DRAFT_NAME_PLACEHOLDER } from "../../lib/db/start-character-draft"
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
  describe("basic-info", () => {
    it("blocks an unnamed draft", () => {
      const result = nextGateForStep(
        "basic-info",
        validCharacter({ name: DRAFT_NAME_PLACEHOLDER })
      )
      expect(result.canAdvance).toBe(false)
      expect(result.canAdvance === false && result.reason).toMatch(/name/i)
    })

    it("blocks a whitespace-only name", () => {
      expect(
        nextGateForStep("basic-info", validCharacter({ name: "   " }))
          .canAdvance
      ).toBe(false)
    })

    it("allows any non-placeholder, non-whitespace name", () => {
      expect(nextGateForStep("basic-info", validCharacter()).canAdvance).toBe(
        true
      )
    })
  })

  describe("path-and-archetype", () => {
    it("blocks when no Origin is picked", () => {
      const result = nextGateForStep(
        "path-and-archetype",
        validCharacter({ originArchetypeKey: null })
      )
      expect(result.canAdvance).toBe(false)
      expect(result.canAdvance === false && result.reason).toMatch(/origin/i)
    })

    it("allows once Origin is set", () => {
      expect(
        nextGateForStep("path-and-archetype", validCharacter()).canAdvance
      ).toBe(true)
    })
  })

  describe("character-origins", () => {
    it("blocks an invalid Virtue allocation", () => {
      const result = nextGateForStep(
        "character-origins",
        validCharacter({
          virtueEmpathy: 0,
          virtueExpression: 2,
          virtueFocus: 2,
          virtueWisdom: 0,
        })
      )
      expect(result.canAdvance).toBe(false)
      expect(result.canAdvance === false && result.reason).toMatch(/virtue/i)
    })

    it("blocks fewer than four Knives", () => {
      const result = nextGateForStep(
        "character-origins",
        validCharacter({
          knives: validCharacter().knives.slice(0, 2),
        })
      )
      expect(result.canAdvance).toBe(false)
      expect(result.canAdvance === false && result.reason).toMatch(/knife/i)
    })

    it("blocks zero Chains", () => {
      const result = nextGateForStep(
        "character-origins",
        validCharacter({ chains: [] })
      )
      expect(result.canAdvance).toBe(false)
      expect(result.canAdvance === false && result.reason).toMatch(/chain/i)
    })

    it("allows a fully valid Origins step", () => {
      expect(
        nextGateForStep("character-origins", validCharacter()).canAdvance
      ).toBe(true)
    })
  })

  describe("identity", () => {
    it.each([
      ["personalityTraits", /personality/i],
      ["hopes", /hope/i],
      ["dreams", /dream/i],
      ["fears", /fear/i],
      ["secrets", /secret/i],
    ] as const)("blocks an empty %s section", (field, pattern) => {
      const result = nextGateForStep(
        "identity",
        validCharacter({ [field]: "   " })
      )
      expect(result.canAdvance).toBe(false)
      expect(result.canAdvance === false && result.reason).toMatch(pattern)
    })

    it("allows all five Identity sections populated", () => {
      expect(nextGateForStep("identity", validCharacter()).canAdvance).toBe(
        true
      )
    })
  })

  describe("unknown step slugs", () => {
    it("never blocks an unrecognized slug — only enumerated steps gate", () => {
      expect(nextGateForStep("review", validCharacter()).canAdvance).toBe(true)
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

  it("returns one failure per failing step, in wizard order", () => {
    const failures = findStepGateFailures(
      validCharacter({
        name: DRAFT_NAME_PLACEHOLDER,
        originArchetypeKey: null,
        virtueEmpathy: 0,
        personalityTraits: null,
      })
    )
    expect(failures.map((f) => f.stepSlug)).toEqual([
      "basic-info",
      "path-and-archetype",
      "character-origins",
      "identity",
    ])
    for (const failure of failures) {
      expect(failure.reason).not.toEqual("")
    }
  })

  it("reports only the steps that fail", () => {
    const failures = findStepGateFailures(
      validCharacter({ originArchetypeKey: null })
    )
    expect(failures).toHaveLength(1)
    expect(failures[0]!.stepSlug).toBe("path-and-archetype")
  })
})
