import { beforeEach, describe, expect, it, vi } from "vitest"

import { checkArchetypeUnlockGates } from "./archetype-unlock-gate"

/**
 * The extracted viewer-identity gates on `spendArchetypeRank` (UNN-645 —
 * previously inline in the entity door action): callers stay blind to which
 * ops are gated, refusals are Result-shaped for the replica door.
 */
const auth = vi.fn()
const hiddenArchetypeKeysFor = vi.fn()
const loadPlayerCharacterById = vi.fn()
const loadNarrativeGate = vi.fn()
const getArchetype = vi.fn()
const isNarrativelyLocked = vi.fn()

vi.mock("@/lib/auth", () => ({ auth: () => auth() }))
vi.mock("@/domain/archetypes/restricted", () => ({
  hiddenArchetypeKeysFor: (email: unknown) => hiddenArchetypeKeysFor(email),
}))
vi.mock("@/lib/db/queries/load-player-character", () => ({
  loadPlayerCharacterById: (id: string) => loadPlayerCharacterById(id),
}))
vi.mock("@/domain/planner/load-narrative-gate", () => ({
  loadNarrativeGate: (input: unknown) => loadNarrativeGate(input),
}))
vi.mock("@/domain/game-engine-v2", () => ({
  getArchetype: (key: string) => getArchetype(key),
}))
vi.mock("@workspace/game-v2/archetypes/atlas", () => ({
  isNarrativelyLocked: (...args: unknown[]) => isNarrativelyLocked(...args),
}))

const unlock = {
  component: "archetypes",
  op: "spendArchetypeRank",
  archetypeKey: "warden",
} as never

beforeEach(() => {
  auth.mockReset().mockResolvedValue({ user: { email: "a@b.c" } })
  hiddenArchetypeKeysFor.mockReset().mockReturnValue([])
  loadPlayerCharacterById.mockReset().mockResolvedValue(null)
  loadNarrativeGate.mockReset().mockResolvedValue(undefined)
  getArchetype.mockReset().mockReturnValue({ key: "warden" })
  isNarrativelyLocked.mockReset().mockReturnValue(false)
})

describe("checkArchetypeUnlockGates", () => {
  it("passes every non-unlock write without touching a gate", async () => {
    const result = await checkArchetypeUnlockGates("e1", {
      component: "vitals",
      op: "damage",
      amount: 1,
    } as never)
    expect(result.ok).toBe(true)
    expect(auth).not.toHaveBeenCalled()
    expect(loadPlayerCharacterById).not.toHaveBeenCalled()
  })

  it("refuses a restricted Archetype for a non-allowlisted viewer", async () => {
    hiddenArchetypeKeysFor.mockReturnValue(["warden"])
    const result = await checkArchetypeUnlockGates("e1", unlock)
    expect(result).toEqual({ ok: false, error: "forbidden" })
  })

  it("passes an unplaced character without resolving the narrative gate", async () => {
    loadPlayerCharacterById.mockResolvedValue({
      campaignId: null,
      entity: {},
    })
    const result = await checkArchetypeUnlockGates("e1", unlock)
    expect(result.ok).toBe(true)
    expect(loadNarrativeGate).not.toHaveBeenCalled()
  })

  it("ranking up an owned Archetype stays legal — acquisition is permanent", async () => {
    loadPlayerCharacterById.mockResolvedValue({
      campaignId: "c1",
      entity: { archetypes: { origin: "warden", roster: [{ key: "warden" }] } },
    })
    const result = await checkArchetypeUnlockGates("e1", unlock)
    expect(result.ok).toBe(true)
    expect(loadNarrativeGate).not.toHaveBeenCalled()
  })

  it("refuses a narratively locked unlock through the same predicate the Atlas renders from", async () => {
    loadPlayerCharacterById.mockResolvedValue({
      campaignId: "c1",
      entity: { archetypes: { origin: "other", roster: [] } },
    })
    loadNarrativeGate.mockResolvedValue({ tier: 1 })
    getArchetype.mockReturnValue({ key: "warden", lineage: "moon" })
    isNarrativelyLocked.mockReturnValue(true)

    const result = await checkArchetypeUnlockGates("e1", unlock)
    expect(result).toEqual({ ok: false, error: "forbidden" })
  })
})
