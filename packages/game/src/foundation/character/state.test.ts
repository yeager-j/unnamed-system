import { describe, expect, it } from "vitest"

import {
  battleConditionsSchema,
  DEFAULT_BATTLE_CONDITIONS,
} from "@workspace/game/foundation/character/state"

describe("battleConditionsSchema", () => {
  it("parses a bare-enum battle-conditions object", () => {
    const conditions = {
      attack: "increased",
      defense: "decreased",
      hitEvasion: "neutral",
      charged: true,
      concentrating: false,
    }
    expect(battleConditionsSchema.parse(conditions)).toEqual(conditions)
  })

  it("parses DEFAULT_BATTLE_CONDITIONS unchanged", () => {
    expect(battleConditionsSchema.parse(DEFAULT_BATTLE_CONDITIONS)).toEqual(
      DEFAULT_BATTLE_CONDITIONS
    )
  })

  it("defaults every axis to neutral", () => {
    expect(DEFAULT_BATTLE_CONDITIONS.attack).toBe("neutral")
    expect(DEFAULT_BATTLE_CONDITIONS.defense).toBe("neutral")
    expect(DEFAULT_BATTLE_CONDITIONS.hitEvasion).toBe("neutral")
  })

  it("strips unknown keys instead of rejecting (no .strict() in the chain)", () => {
    const parsed = battleConditionsSchema.parse({
      ...DEFAULT_BATTLE_CONDITIONS,
      stacks: 1,
    })
    expect(parsed).toEqual(DEFAULT_BATTLE_CONDITIONS)
    expect("stacks" in parsed).toBe(false)
  })

  it("rejects the legacy `{ state, stacks }` axis shape (migration 0017 normalizes it)", () => {
    const legacy = {
      attack: { state: "increased", stacks: 1 },
      defense: { state: "neutral", stacks: 0 },
      hitEvasion: { state: "neutral", stacks: 0 },
      charged: false,
      concentrating: false,
    }
    expect(battleConditionsSchema.safeParse(legacy).success).toBe(false)
  })
})
