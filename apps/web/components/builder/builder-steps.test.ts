import { describe, expect, it } from "vitest"

import {
  BUILDER_STEPS,
  FIRST_STEP_SLUG,
  indexOfStep,
  slugForStepIndex,
} from "./builder-steps"

describe("BUILDER_STEPS", () => {
  it("has unique URL-safe slugs", () => {
    const slugs = BUILDER_STEPS.map((step) => step.slug)
    expect(new Set(slugs).size).toBe(slugs.length)
    for (const slug of slugs) {
      expect(slug).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it("FIRST_STEP_SLUG matches the first entry", () => {
    expect(FIRST_STEP_SLUG).toBe(BUILDER_STEPS[0]!.slug)
  })

  it("indexOfStep round-trips known slugs", () => {
    for (let i = 0; i < BUILDER_STEPS.length; i += 1) {
      expect(indexOfStep(BUILDER_STEPS[i]!.slug)).toBe(i)
    }
  })

  it("indexOfStep returns null for an unknown slug", () => {
    expect(indexOfStep("not-a-step")).toBeNull()
  })

  it("slugForStepIndex clamps out-of-range indices", () => {
    expect(slugForStepIndex(-1)).toBe(BUILDER_STEPS[0]!.slug)
    expect(slugForStepIndex(BUILDER_STEPS.length + 10)).toBe(
      BUILDER_STEPS[BUILDER_STEPS.length - 1]!.slug
    )
  })
})
