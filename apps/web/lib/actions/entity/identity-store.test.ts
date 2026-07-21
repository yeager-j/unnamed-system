import { beforeEach, describe, expect, it, vi } from "vitest"

import { createStampAccumulator } from "@workspace/headcanon"
import { MutationContentionError } from "@workspace/headcanon/drizzle"
import { ok } from "@workspace/result"

import { entityIdentityAxis } from "@/lib/db/axes"

// The Store pulls `server-only` transitively (version-guard → realtime/publish);
// neutralize the build-time guard for the node runner.
vi.mock("server-only", () => ({}))

/**
 * The executor-neutral identity Store `commitIdentityWrite` (UNN-675). Only the
 * authoritative load is stubbed; the real descriptor patch algebra runs. The
 * contract under test: load → strict-owner authorization → server-composed
 * per-field patch → guarded write on the version it just read → identity axis
 * stamp, with a lost race surfacing as contention rather than a rejection.
 */
const loadPlayerCharacterById = vi.fn()

vi.mock("@/lib/db/queries/load-player-character", () => ({
  loadPlayerCharacterById: (id: string, executor: unknown) =>
    loadPlayerCharacterById(id, executor),
}))

const { commitIdentityWrite } = await import("./identity-store")

const ENTITY_ID = "e1"
const ACTOR = { userId: "u1", email: "u1@example.com" }

function loaded(overrides: Record<string, unknown> = {}) {
  return {
    status: "finalized" as const,
    userId: ACTOR.userId,
    entity: {
      id: ENTITY_ID,
      shortId: "s1",
      name: "Momo",
      portraitUrl: null,
      pronouns: null,
      notes: null,
      identityVersion: 3,
      ...overrides,
    },
  }
}

/** A chainable stand-in for the guarded UPDATE that records what it was asked to
 *  `SET`; `updated` is what `.returning()` yields, so `[]` models a lost race. */
function fakeExecutor(updated: { version: number; shortId: string }[]) {
  let patch: Record<string, unknown> | null = null
  const chain = {
    set: (next: Record<string, unknown>) => {
      patch = next
      return chain
    },
    where: () => chain,
    returning: async () => updated,
  }
  return {
    executor: { update: () => chain } as never,
    patch: () => patch,
    updateCalled: () => patch !== null,
  }
}

beforeEach(() => {
  loadPlayerCharacterById.mockReset()
})

describe("commitIdentityWrite — executor-neutral identity column writes", () => {
  it("loads, authorizes, composes the patch, guards, and stamps the identity axis", async () => {
    loadPlayerCharacterById.mockResolvedValue(loaded())
    const stamp = createStampAccumulator()
    const { executor, patch } = fakeExecutor([{ version: 4, shortId: "s1" }])

    const result = await commitIdentityWrite(
      executor,
      ACTOR,
      { entityId: ENTITY_ID, write: { field: "name", value: "Vela" } },
      stamp
    )

    expect(result).toEqual(ok({ version: 4, shortId: "s1" }))
    expect(stamp.accepted().revisions).toEqual({
      [entityIdentityAxis(ENTITY_ID)]: 4,
    })
    expect(loadPlayerCharacterById).toHaveBeenCalledWith(ENTITY_ID, executor)
    // Exactly the written column plus the class increment — a sibling class's
    // column cannot be touched by construction (CH15).
    expect(Object.keys(patch() ?? {}).sort()).toEqual([
      "identityVersion",
      "name",
    ])
    expect(patch()).toMatchObject({ name: "Vela" })
  })

  it("composes the patch server-side from the descriptor, canonicalizing a cleared column", async () => {
    loadPlayerCharacterById.mockResolvedValue(loaded())
    const stamp = createStampAccumulator()
    const { executor, patch } = fakeExecutor([{ version: 4, shortId: "s1" }])

    await commitIdentityWrite(
      executor,
      ACTOR,
      { entityId: ENTITY_ID, write: { field: "pronouns", value: "  " } },
      stamp
    )

    expect(patch()).toMatchObject({ pronouns: null })
  })

  it("rejects a missing entity without writing", async () => {
    loadPlayerCharacterById.mockResolvedValue(null)
    const stamp = createStampAccumulator()
    const { executor, updateCalled } = fakeExecutor([])

    const result = await commitIdentityWrite(
      executor,
      ACTOR,
      { entityId: ENTITY_ID, write: { field: "name", value: "Vela" } },
      stamp
    )

    expect(result).toEqual({ ok: false, error: "entity-not-found" })
    expect(updateCalled()).toBe(false)
  })

  it("refuses a non-owner as a typed rejection, not a throw", async () => {
    // Strict owner even for the campaign DM: unlike a `vitals` component write,
    // no console has sanctioned access to a player's name or notes.
    loadPlayerCharacterById.mockResolvedValue(loaded())
    const stamp = createStampAccumulator()
    const { executor, updateCalled } = fakeExecutor([])

    const result = await commitIdentityWrite(
      executor,
      { userId: "someone-else", email: "dm@example.com" },
      { entityId: ENTITY_ID, write: { field: "notes", value: "peeked" } },
      stamp
    )

    expect(result).toEqual({ ok: false, error: "unauthorized" })
    expect(updateCalled()).toBe(false)
    expect(stamp.accepted().revisions).toEqual({})
  })

  it("throws contention (not a rejection) when the guarded write loses a race", async () => {
    loadPlayerCharacterById.mockResolvedValue(loaded())
    const stamp = createStampAccumulator()
    const { executor } = fakeExecutor([])

    await expect(
      commitIdentityWrite(
        executor,
        ACTOR,
        { entityId: ENTITY_ID, write: { field: "name", value: "Vela" } },
        stamp
      )
    ).rejects.toBeInstanceOf(MutationContentionError)
  })

  it("throws on a stored version column that is not a valid revision", async () => {
    loadPlayerCharacterById.mockResolvedValue(loaded())
    const stamp = createStampAccumulator()
    const { executor } = fakeExecutor([{ version: -1, shortId: "s1" }])

    await expect(
      commitIdentityWrite(
        executor,
        ACTOR,
        { entityId: ENTITY_ID, write: { field: "name", value: "Vela" } },
        stamp
      )
    ).rejects.toThrow("identityVersion is not a valid revision")
  })
})
