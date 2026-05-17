import { describe, expect, it } from "vitest"
import { ARCHETYPES } from "../archetypes"
import { skillSchema } from "./schema"
import { getAllSkills, getSkill, SKILLS } from "./index"
import { agi } from "./agi"
import { amritaDrop } from "./amrita-drop"
import { cleave } from "./cleave"
import { criticalStrike } from "./critical-strike"
import { dia } from "./dia"
import { divineJudgment } from "./divine-judgment"
import { elementalApocalypse } from "./elemental-apocalypse"
import { hammerOfJustice } from "./hammer-of-justice"
import { media } from "./media"
import { peerlessStonecleaver } from "./peerless-stonecleaver"
import { shieldArts } from "./shield-arts"
import { slashBoost } from "./slash-boost"
import { tempestSlash } from "./tempest-slash"

describe("skill data", () => {
  it("validates every Skill against the schema", () => {
    for (const skill of SKILLS) {
      expect(() => skillSchema.parse(skill)).not.toThrow()
    }
  })

  it("exposes exactly the 24 MVP Skills", () => {
    expect(SKILLS).toHaveLength(24)
    expect(getAllSkills()).toHaveLength(24)
  })

  it("has a unique, slug-shaped key for every Skill", () => {
    const keys = SKILLS.map((skill) => skill.key)
    expect(new Set(keys).size).toBe(keys.length)
    for (const key of keys) {
      expect(key).toMatch(/^[a-z0-9-]+$/)
    }
  })

  it("resolves every Skill by its own key", () => {
    for (const skill of SKILLS) {
      expect(getSkill(skill.key)).toBe(skill)
    }
  })
})

describe("archetype cross-references", () => {
  it("resolves every Skill referenced by an Archetype", () => {
    for (const archetype of ARCHETYPES) {
      for (const reference of archetype.skills) {
        expect(getSkill(reference.skill)).toBeDefined()
      }
      if (archetype.synthesisSkill) {
        expect(getSkill(archetype.synthesisSkill.skill)).toBeDefined()
      }
    }
  })

  it("marks each Archetype's synthesis Skill as synthesis", () => {
    for (const archetype of ARCHETYPES) {
      if (!archetype.synthesisSkill) continue
      const synthesis = getSkill(archetype.synthesisSkill.skill)
      expect(synthesis?.isSynthesis).toBe(true)
    }
  })

  it("never marks a non-synthesis ranked Skill as synthesis", () => {
    for (const archetype of ARCHETYPES) {
      for (const reference of archetype.skills) {
        expect(getSkill(reference.skill)?.isSynthesis).toBe(false)
      }
    }
  })
})

describe("getSkill", () => {
  it("returns the matching Skill by key", () => {
    expect(getSkill("cleave")).toBe(cleave)
    expect(getSkill("agi")).toBe(agi)
    expect(getSkill("divine-judgment")).toBe(divineJudgment)
  })

  it("returns undefined for an unknown key", () => {
    expect(getSkill("nope")).toBeUndefined()
  })
})

describe("cost union edge cases", () => {
  it("keeps HP-percent and SP costs distinct", () => {
    expect(cleave.cost).toEqual({ kind: "hp-percent", amount: 5 })
    expect(tempestSlash.cost).toEqual({ kind: "hp-percent", amount: 15 })
    expect(agi.cost).toEqual({ kind: "sp", amount: 4 })
  })

  it("rejects a non-positive or out-of-range cost amount", () => {
    expect(() =>
      skillSchema.parse({ ...cleave, cost: { kind: "hp-percent", amount: 0 } })
    ).toThrow()
    expect(() =>
      skillSchema.parse({
        ...cleave,
        cost: { kind: "hp-percent", amount: 101 },
      })
    ).toThrow()
    expect(() =>
      skillSchema.parse({ ...agi, cost: { kind: "sp", amount: 0 } })
    ).toThrow()
  })

  it("omits cost entirely on passive Skills", () => {
    expect(slashBoost.kind).toBe("passive")
    expect("cost" in slashBoost).toBe(false)
  })
})

describe("transcription spot-checks", () => {
  it("keeps the Cleave attack-roll tiers", () => {
    expect(cleave.attackRoll.tiers).toEqual([
      { band: "1-10", formula: "1d6 + St", sideEffects: [] },
      { band: "11-19", formula: "1d10 + St", sideEffects: [] },
      { band: "20+", formula: "1d10 + St", sideEffects: ["Critical"] },
    ])
  })

  it("keeps Shield Arts' ordered multi side-effects", () => {
    expect(shieldArts.attackRoll.tiers[2]?.sideEffects).toEqual([
      "Applies Sukunda",
      "Critical",
    ])
  })

  it("keeps Critical Strike's non-standard bands", () => {
    expect(criticalStrike.attackRoll.tiers.map((tier) => tier.band)).toEqual([
      "1-10",
      "11-15",
      "16+",
    ])
  })

  it("models severe inline-damage Skills with no attack roll", () => {
    expect("attackRoll" in peerlessStonecleaver).toBe(false)
    expect(peerlessStonecleaver.damage).toBe("12d10")
  })

  it("distinguishes a healing formula from a cure-only heal", () => {
    expect(dia.damage).toBe("2d8 + Ma")
    expect("damage" in amritaDrop).toBe(false)
  })

  it("uses the special damage type for multi-element Skills", () => {
    expect(elementalApocalypse.damageType).toBe("special")
  })

  it("keeps Tempest Slash's hit count and attack attribute", () => {
    expect(tempestSlash.hits).toBe(3)
    expect(tempestSlash.attackRoll.attribute).toBe("st")
  })
})

describe("source-data discrepancy guards", () => {
  it("uses Media's correct SP cost (frontmatter, not the card body)", () => {
    expect(media.cost).toEqual({ kind: "sp", amount: 7 })
  })

  it("uses Hammer of Justice's correct Pierce damage type", () => {
    expect(hammerOfJustice.damageType).toBe("pierce")
  })

  it("uses Divine Judgment's correct range (card body, not frontmatter)", () => {
    expect(divineJudgment.range).toEqual({
      kind: "known",
      value: "same-or-adjacent-zone",
    })
  })
})
