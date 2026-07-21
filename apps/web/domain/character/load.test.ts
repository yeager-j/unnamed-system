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

import {
  toCharacterCanon,
  toCharacterMount,
  type LoadedCharacter,
} from "./load"

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
      portraitUrl: "https://blob.example/portraits/a.png",
      pronouns: "they/them",
      notes: null,
    },
    versions: { identity: 3, vitals: 7, inventory: 1, progression: 5 },
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

  it("carries what the four axes govern, not the whole profile", () => {
    const loaded = loadedCharacter()
    const canon = toCharacterCanon(loaded)

    expect(canon.value.entity).toBe(loaded.entity)
    expect(canon.value.resolved).toBe(loaded.resolved)
    expect(canon.value.identity).toEqual({
      name: loaded.profile.name,
      pronouns: "they/them",
      portraitUrl: "https://blob.example/portraits/a.png",
      notes: null,
    })
    // The unversioned subtype lifecycle facts and the immutable ids stay out:
    // no axis revision speaks for them (UNN-675).
    expect(canon.value).not.toHaveProperty("profile")
    expect(canon.value.identity).not.toHaveProperty("status")
    expect(canon.value.identity).not.toHaveProperty("builderStep")
  })
})

describe("toCharacterMount crosses the RSC boundary", () => {
  /** Every object React's serializer would walk on the way to a Client
   *  Component, in one flat list. */
  function reachableObjects(root: unknown): unknown[] {
    const found: unknown[] = []
    const seen = new WeakSet<object>()
    const visit = (value: unknown) => {
      if (value === null || typeof value !== "object") return
      if (seen.has(value)) return
      seen.add(value)
      found.push(value)
      for (const nested of Object.values(value)) visit(nested)
    }
    visit(root)
    return found
  }

  // The mount is a Server Component prop, so React applies "only plain objects,
  // and a few built-ins, can be passed to Client Components" to the whole tree.
  // A null-prototype revision vector failed exactly here (the canon is the one
  // part of this prop the package builds), so the contract is pinned at the
  // seam that broke, not only inside the package.
  it("contains no class instance or null-prototype object", () => {
    const mount = toCharacterMount(loadedCharacter())

    const rejected = reachableObjects(mount).filter((value) => {
      if (Array.isArray(value)) return false
      const prototype = Object.getPrototypeOf(value)
      return prototype !== Object.prototype && prototype !== null
    })

    expect(rejected).toEqual([])
    expect(Object.getPrototypeOf(mount.canon.revisions)).toBe(Object.prototype)
  })
})
