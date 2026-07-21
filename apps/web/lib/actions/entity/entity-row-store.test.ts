import { beforeEach, describe, expect, it, vi } from "vitest"

import { createStampAccumulator } from "@workspace/headcanon"
import { MutationContentionError } from "@workspace/headcanon/drizzle"
import { err, ok } from "@workspace/result"

import { entityVitalsAxis } from "@/lib/db/axes"

// The handler pulls `server-only` transitively (version-guard → realtime/publish);
// neutralize the build-time guard for the node runner.
vi.mock("server-only", () => ({}))

/**
 * The executor-neutral durable Store `commitEntityWrite` (UNN-674) — the one
 * implementation the Headcanon handler and the standalone doors share. The two
 * impure collaborators are stubbed (the authoritative load and the contextual
 * authorization, each proven in its own home); the real assemble seam + the real
 * Writers run. The contract under test: a component write flows load → authorize →
 * pure Writer → server-authoritative guarded write → axis stamp, an authorization
 * refusal and a Writer refusal short-circuit before the guard, and a lost race is
 * contention (not a rejection). No client `expectedVersion` on the wire — the guard
 * reads the version off the loaded row.
 */
const loadPlayerCharacterById = vi.fn()
const authorizeEntityWrite = vi.fn()

vi.mock("@/lib/db/queries/load-player-character", () => ({
  loadPlayerCharacterById: (id: string, executor: unknown) =>
    loadPlayerCharacterById(id, executor),
}))
vi.mock("./authorize-write", () => ({
  authorizeEntityWrite: (
    executor: unknown,
    actor: unknown,
    pc: unknown,
    write: unknown
  ) => authorizeEntityWrite(executor, actor, pc, write),
}))

const { commitEntityWrite } = await import("./entity-row-store")

const ENTITY_ID = "e1"
const ACTOR = { userId: "u1", email: "u1@example.com" }

/** A minimal `entity` row the assemble seam projects — only the columns a test
 *  reads need be present; absent component columns are simply absent components. */
function row(overrides: Record<string, unknown>) {
  return {
    id: ENTITY_ID,
    shortId: "s1",
    name: "Momo",
    portraitUrl: null,
    pronouns: null,
    vitalsVersion: 3,
    ...overrides,
  }
}

/** The loaded player character the authoritative load returns (R3 — UNN-573): the
 *  subtype row (here just `status`) carrying its `entity` substrate. */
function loaded(overrides: Record<string, unknown>) {
  return { status: "finalized" as const, entity: row(overrides) }
}

/** A chainable stand-in for the guarded UPDATE; `updated` is what `.returning()`
 *  yields, so `[]` models a lost race and a row models acceptance. */
function fakeExecutor(updated: { version: number; shortId: string }[]): {
  executor: unknown
  updateCalled: () => boolean
} {
  let called = false
  const chain = {
    set: () => chain,
    where: () => chain,
    returning: async () => {
      called = true
      return updated
    },
  }
  return { executor: { update: () => chain }, updateCalled: () => called }
}

beforeEach(() => {
  loadPlayerCharacterById.mockReset()
  authorizeEntityWrite.mockReset().mockResolvedValue(ok(undefined))
})

describe("commitEntityWrite — executor-neutral durable component writes", () => {
  it("loads, authorizes, predicts, guards, and stamps the write's class axis", async () => {
    loadPlayerCharacterById.mockResolvedValue(
      loaded({ vitals: { base: 20, damage: 0 } })
    )
    const stamp = createStampAccumulator()
    const { executor } = fakeExecutor([{ version: 8, shortId: "s1" }])

    const result = await commitEntityWrite(
      executor as never,
      ACTOR,
      {
        entityId: ENTITY_ID,
        write: { component: "vitals", op: "damage", amount: 7 },
      },
      stamp
    )

    expect(result).toEqual(
      ok({
        version: 8,
        shortId: "s1",
        versionClass: "vitals",
        status: "finalized",
      })
    )
    expect(stamp.accepted().revisions).toEqual({
      [entityVitalsAxis(ENTITY_ID)]: 8,
    })
    expect(loadPlayerCharacterById).toHaveBeenCalledWith(ENTITY_ID, executor)
  })

  it("rejects a missing entity without authorizing or writing", async () => {
    loadPlayerCharacterById.mockResolvedValue(null)
    const stamp = createStampAccumulator()
    const { executor, updateCalled } = fakeExecutor([])

    const result = await commitEntityWrite(
      executor as never,
      ACTOR,
      {
        entityId: ENTITY_ID,
        write: { component: "vitals", op: "damage", amount: 1 },
      },
      stamp
    )

    expect(result).toEqual({ ok: false, error: "entity-not-found" })
    expect(authorizeEntityWrite).not.toHaveBeenCalled()
    expect(updateCalled()).toBe(false)
  })

  it("forwards a contextual authorization refusal before the guard", async () => {
    loadPlayerCharacterById.mockResolvedValue(
      loaded({ vitals: { base: 20, damage: 0 } })
    )
    authorizeEntityWrite.mockResolvedValue(err("unauthorized"))
    const stamp = createStampAccumulator()
    const { executor, updateCalled } = fakeExecutor([])

    const result = await commitEntityWrite(
      executor as never,
      ACTOR,
      {
        entityId: ENTITY_ID,
        write: { component: "vitals", op: "damage", amount: 1 },
      },
      stamp
    )

    expect(result).toEqual({ ok: false, error: "unauthorized" })
    expect(updateCalled()).toBe(false)
    expect(stamp.accepted().revisions).toEqual({})
  })

  it("refuses a write against an absent component before the guard", async () => {
    loadPlayerCharacterById.mockResolvedValue(
      loaded({ vitals: { base: 20, damage: 0 } })
    )
    const stamp = createStampAccumulator()
    const { executor, updateCalled } = fakeExecutor([])

    const result = await commitEntityWrite(
      executor as never,
      ACTOR,
      {
        entityId: ENTITY_ID,
        write: { component: "skillPool", op: "damage", amount: 2 },
      },
      stamp
    )

    expect(result).toEqual({ ok: false, error: "capability-missing" })
    expect(updateCalled()).toBe(false)
  })

  it("throws contention (not a rejection) when the guarded write loses a race", async () => {
    loadPlayerCharacterById.mockResolvedValue(
      loaded({ vitals: { base: 20, damage: 0 } })
    )
    const stamp = createStampAccumulator()
    const { executor } = fakeExecutor([])

    await expect(
      commitEntityWrite(
        executor as never,
        ACTOR,
        {
          entityId: ENTITY_ID,
          write: { component: "vitals", op: "damage", amount: 1 },
        },
        stamp
      )
    ).rejects.toBeInstanceOf(MutationContentionError)
  })

  it("errs `entity-load-failed` when the stored components are malformed", async () => {
    loadPlayerCharacterById.mockResolvedValue(
      loaded({ vitals: { base: "not-a-number" } })
    )
    const stamp = createStampAccumulator()
    const { executor, updateCalled } = fakeExecutor([])

    const result = await commitEntityWrite(
      executor as never,
      ACTOR,
      {
        entityId: ENTITY_ID,
        write: { component: "vitals", op: "damage", amount: 1 },
      },
      stamp
    )

    expect(result).toEqual({ ok: false, error: "entity-load-failed" })
    expect(updateCalled()).toBe(false)
  })
})
