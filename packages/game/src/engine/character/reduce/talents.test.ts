import { describe, expect, it } from "vitest"

import { makeRawCharacterInputs } from "@workspace/game/engine/__fixtures__/index"
import { reduceTalentEdit } from "@workspace/game/engine/character/reduce/talents"

describe("reduceTalentEdit — talentAdd", () => {
  it("appends a new key to the gained list", () => {
    const raw = makeRawCharacterInputs({ row: { gainedTalents: ["climb"] } })
    expect(
      reduceTalentEdit(raw, { kind: "talentAdd", talentKey: "alchemy" })?.row
        .gainedTalents
    ).toEqual(["climb", "alchemy"])
  })

  it("is a no-op when the key is already present", () => {
    const raw = makeRawCharacterInputs({ row: { gainedTalents: ["climb"] } })
    expect(
      reduceTalentEdit(raw, { kind: "talentAdd", talentKey: "climb" })
    ).toBeNull()
  })
})

describe("reduceTalentEdit — talentRemove", () => {
  it("removes only the matching key, keeping the rest", () => {
    const raw = makeRawCharacterInputs({
      row: { gainedTalents: ["climb", "alchemy", "lift"] },
    })
    expect(
      reduceTalentEdit(raw, { kind: "talentRemove", talentKey: "alchemy" })?.row
        .gainedTalents
    ).toEqual(["climb", "lift"])
  })

  it("leaves the list intact when the key is absent (patch is a no-op clone)", () => {
    const raw = makeRawCharacterInputs({
      row: { gainedTalents: ["climb", "lift"] },
    })
    expect(
      reduceTalentEdit(raw, { kind: "talentRemove", talentKey: "alchemy" })?.row
        .gainedTalents
    ).toEqual(["climb", "lift"])
  })
})
