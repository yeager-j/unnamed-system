import { describe, expect, it } from "vitest"

import { collectSkillRefs } from "@workspace/game-v2/skills/collect"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

function skill(overrides: Partial<Skill> & { key: string }): Skill {
  return {
    kind: "attack",
    name: overrides.key,
    tagline: "t",
    description: "d",
    isSynthesis: false,
    ...overrides,
  }
}

const psi = skill({ key: "psi" })
const inlineBite = skill({ key: "bite" })

describe("collectSkillRefs (the intrinsic Skills component → catalog Skills)", () => {
  it("resolves catalog refs, passes inline Skills through, and drops unresolved refs", () => {
    const collected = collectSkillRefs(
      [
        { kind: "ref", key: "psi" },
        { kind: "inline", skill: inlineBite },
        { kind: "ref", key: "missing" },
      ],
      (key) => (key === "psi" ? psi : undefined)
    )
    expect(collected.map((s) => s.key)).toEqual(["psi", "bite"])
  })

  it("is empty for an empty ref list", () => {
    expect(collectSkillRefs([], () => undefined)).toEqual([])
  })
})
