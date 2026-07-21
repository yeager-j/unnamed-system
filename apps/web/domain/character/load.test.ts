import { describe, expect, it, vi } from "vitest"

import { resolveEntity } from "@/domain/game-engine-v2"
import {
  SEED_CHARACTERS,
  seedCharacterToEntity,
} from "@/lib/__fixtures__/seed-characters"
import {
  entityIdentityAxis,
  entityInventoryAxis,
  entityProgressionAxis,
  entityVitalsAxis,
} from "@/lib/db/axes"

import { toCharacterCanon, type LoadedCharacter } from "./load"

// `load.ts` is `server-only`; neutralize the build-time guard so its pure
// `toCharacterCanon` projection can be unit-tested in the node runner.
vi.mock("server-only", () => ({}))

function loadedCharacter(): LoadedCharacter {
  const entity = seedCharacterToEntity(SEED_CHARACTERS[0]!)
  return {
    entity,
    resolved: resolveEntity(entity),
    profile: {
      id: entity.id,
      shortId: "short-1",
      ownerId: "owner-1",
      campaignId: null,
      status: "finalized",
      builderStep: 0,
      name: entity.components.identity?.name ?? "",
      portraitUrl: null,
      pronouns: null,
      notes: null,
      versions: { identity: 3, vitals: 7, inventory: 1, progression: 5 },
    },
  }
}

describe("toCharacterCanon (AC #3)", () => {
  it("observes the four entity axes from one row's versions", () => {
    const loaded = loadedCharacter()
    const canon = toCharacterCanon(loaded)
    const { id } = loaded.profile

    expect(canon.revisions).toEqual({
      [entityIdentityAxis(id)]: 3,
      [entityVitalsAxis(id)]: 7,
      [entityInventoryAxis(id)]: 1,
      [entityProgressionAxis(id)]: 5,
    })
    expect(Object.keys(canon.revisions)).toHaveLength(4)
  })

  it("carries the entity-centric value, not the profile", () => {
    const loaded = loadedCharacter()
    const canon = toCharacterCanon(loaded)

    expect(canon.value.entity).toBe(loaded.entity)
    expect(canon.value.resolved).toBe(loaded.resolved)
    expect(canon.value).not.toHaveProperty("profile")
  })
})
