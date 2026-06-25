import { describe, expect, it } from "vitest"

import { getSkill, SKILLS } from "@workspace/game-v2/catalog/skills"
import { renderFormula } from "@workspace/game-v2/combat/formula"

/**
 * Completeness + parity gate for the ported v1 Skill catalog (PR-S / UNN-506).
 * Importing the catalog already runs `skillSchema.parse` over every Skill (the
 * loader throws on a malformed shape or bad vocab), so this asserts the **set** is
 * complete — every v1 key present, none dropped or renamed — plus a couple of
 * spot-checks that the reshape (typed-damage facet, structured tier formula) landed.
 */
const V1_SKILL_KEYS = [
  "agi",
  "ailment-boost",
  "amrita-drop",
  "auto-rakukaja",
  "auto-sukukaja",
  "auto-tarukaja",
  "avarice",
  "bards-insight",
  "bash",
  "blade-of-elec",
  "blade-of-fire",
  "blade-of-ice",
  "blade-of-wind",
  "bufu",
  "cantata",
  "cleave",
  "critical-strike",
  "cruel-attack",
  "dia",
  "divine-judgment",
  "door-to-hades",
  "eiha",
  "elemental-apocalypse",
  "evil-touch",
  "feint",
  "flash-bomb",
  "garu",
  "grand-heist",
  "hammer-of-justice",
  "healers-insight",
  "knights-proclamation",
  "kouha",
  "magic-circle",
  "makajam",
  "media",
  "memory-blow",
  "peerless-stonecleaver",
  "phantom-tracer",
  "psi",
  "pulpina",
  "rakukaja",
  "rampage",
  "shield-arts",
  "showtime",
  "skewer",
  "slash-boost",
  "spirit-break",
  "storm-thrust",
  "sukukaja",
  "tarukaja",
  "tempest-slash",
  "wanton-destruction",
  "war-cry",
  "windblade",
  "zio",
] as const

describe("ported v1 Skill catalog", () => {
  it("ports every v1 Skill key, with no extras", () => {
    expect(SKILLS).toHaveLength(V1_SKILL_KEYS.length)
    expect(new Set(SKILLS.map((s) => s.key))).toEqual(new Set(V1_SKILL_KEYS))
  })

  it.each(V1_SKILL_KEYS)("resolves %s by key", (key) => {
    expect(getSkill(key)?.key).toBe(key)
  })

  it("reshapes a rolled damage Skill: typed-damage facet + structured tiers", () => {
    const agi = getSkill("agi")
    expect(agi?.damage).toEqual({ damageType: "fire", delivery: "magical" })
    const firstTier = agi?.attackRoll?.tiers[0]
    expect(firstTier?.formula && renderFormula(firstTier.formula)).toBe(
      "1d4 + Ma"
    )
  })

  it("keeps dedicated Ailment Skills tagged ailment (drives Ailment Boost)", () => {
    expect(getSkill("evil-touch")?.kind).toBe("ailment")
    expect(getSkill("makajam")?.kind).toBe("ailment")
  })
})
