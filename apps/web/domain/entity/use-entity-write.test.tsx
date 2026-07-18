// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"
import { err, ok } from "@workspace/result"

import type { CharacterProfile, LoadedCharacter } from "@/domain/character/load"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { resolveEntity } from "@/domain/game-engine-v2"
import { pushEntityMutationAction } from "@/lib/actions/entity/replica/push"
import { loadEntityAcceptedAction } from "@/lib/actions/entity/replica/snapshot"

import {
  EntityWriteProvider,
  useEntityIdentityQueue,
  useEntityWrite,
  useLoadedCharacter,
} from "./use-entity-write"

/**
 * The replica-backed provider (UNN-645): the REAL replica runtime, transport,
 * and source run here — only the two door actions, the realtime channel, and
 * the router are stubbed. The old one-shot stale-retry suite retired with the
 * expectedVersion protocol it tested; ordering/dedup/rebase live in
 * `@workspace/replica`'s law suites and the binding contract test.
 */
const { routerRefresh } = vi.hoisted(() => ({ routerRefresh: vi.fn() }))

interface CapturedChannel {
  domain: string
  shortId: string
  onPing: (data: unknown) => void
  onReconnect?: () => void
}
const { capturedChannel } = vi.hoisted(() => ({
  capturedChannel: { current: null as CapturedChannel | null },
}))

vi.mock("@/lib/actions/entity/replica/push", () => ({
  pushEntityMutationAction: vi.fn(),
}))
vi.mock("@/lib/actions/entity/replica/snapshot", () => ({
  loadEntityAcceptedAction: vi.fn(),
}))
vi.mock("@/lib/actions/entity/versions", () => ({
  getEntityClassVersionAction: vi.fn(),
}))
vi.mock("@/lib/sync/use-realtime-channel", () => ({
  useRealtimeChannel: (args: CapturedChannel) => {
    capturedChannel.current = args
  },
}))
vi.mock("sonner", () => ({ toast: { error: vi.fn() } }))
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: routerRefresh }),
}))

const pushAction = vi.mocked(pushEntityMutationAction)
const acceptedAction = vi.mocked(loadEntityAcceptedAction)
const { toast } = await import("sonner")

const baseComponents = { vitals: { base: 10, damage: 0 } }

const entity: Entity = {
  id: "char-1",
  components: baseComponents,
}

const profile = {
  id: "char-1",
  shortId: "abc123",
  ownerId: "user-1",
  campaignId: null,
  status: "finalized" as const,
  builderStep: 5,
  name: "Test",
  portraitUrl: null,
  pronouns: null,
  notes: null,
  versions: { identity: 1, vitals: 1, inventory: 1, progression: 1 },
} satisfies CharacterProfile

const loaded: LoadedCharacter = {
  profile,
  entity,
  resolved: resolveEntity(entity),
}

/** The authority's accepted tuple as the snapshot action would serve it. */
function accepted(components: Record<string, unknown>, through = 0) {
  return ok({
    value: components,
    through,
    cursor: { identity: 1, vitals: 1, inventory: 1, progression: 1 },
  })
}

const damage: EntityWrite = { component: "vitals", op: "damage", amount: 1 }

const wrapper = ({ children }: { children: React.ReactNode }) => (
  <EntityWriteProvider loaded={loaded}>{children}</EntityWriteProvider>
)

/** Drains the bootstrap read + replica delivery microtasks. */
const flush = () => act(async () => {})

beforeEach(() => {
  pushAction.mockReset().mockResolvedValue(ok(undefined))
  acceptedAction.mockReset().mockResolvedValue(accepted(baseComponents))
  routerRefresh.mockReset()
  vi.mocked(toast.error).mockReset()
  capturedChannel.current = null
})

describe("useEntityWrite — replica dispatch (UNN-645)", () => {
  it("short-circuits a local Writer refusal before any delivery", async () => {
    const missingSkillPool: EntityWrite = {
      component: "skillPool",
      op: "damage",
      amount: 1,
    }

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await flush()
    await act(async () => result.current.dispatch(missingSkillPool))

    expect(pushAction).not.toHaveBeenCalled()
    expect(toast.error).toHaveBeenCalledWith(
      "That change can't apply to this character. Reload and try again."
    )
  })

  it("lets a refusal-specific handler suppress the default toast", async () => {
    const onError = vi.fn(() => true)
    const missingSkillPool: EntityWrite = {
      component: "skillPool",
      op: "damage",
      amount: 1,
    }

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await flush()
    await act(async () =>
      result.current.dispatch(missingSkillPool, { onError })
    )

    expect(onError).toHaveBeenCalledWith("capability-missing")
    expect(pushAction).not.toHaveBeenCalled()
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("projects the prediction into the frame and delivers one ordered envelope", async () => {
    const onSuccess = vi.fn()
    const { result } = renderHook(
      () => ({ write: useEntityWrite(), frame: useLoadedCharacter() }),
      { wrapper }
    )
    await flush()

    await act(async () => {
      result.current.write.dispatch(damage, { onSuccess })
    })
    await flush()

    expect(result.current.frame.entity.components.vitals).toEqual({
      base: 10,
      damage: 1,
    })
    expect(onSuccess).toHaveBeenCalled()
    expect(pushAction).toHaveBeenCalledTimes(1)
    const input = pushAction.mock.calls[0]![0] as {
      entityId: string
      envelope: { mutationId: number; invocation: { name: string } }
    }
    expect(input.entityId).toBe("char-1")
    expect(input.envelope.mutationId).toBe(1)
    expect(input.envelope.invocation.name).toBe("entity.write")
    expect(toast.error).not.toHaveBeenCalled()
  })

  it("serializes back-to-back writes with strictly sequential mutation IDs", async () => {
    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await flush()

    await act(async () => {
      result.current.dispatch(damage)
      result.current.dispatch(damage)
    })
    await flush()

    const ids = pushAction.mock.calls.map(
      (call) =>
        (call[0] as { envelope: { mutationId: number } }).envelope.mutationId
    )
    expect(ids).toEqual([1, 2])
  })

  it("rolls back the prediction on a trusted remote rejection and routes the code to onError", async () => {
    pushAction.mockResolvedValue(
      err({ kind: "rejected", error: "capability-missing" })
    )
    const onError = vi.fn(() => false)
    const { result } = renderHook(
      () => ({ write: useEntityWrite(), frame: useLoadedCharacter() }),
      { wrapper }
    )
    await flush()

    await act(async () => {
      result.current.write.dispatch(damage, { onError })
    })
    await flush()

    expect(onError).toHaveBeenCalledWith("capability-missing")
    expect(toast.error).toHaveBeenCalledWith("Couldn't save. Try again.")
    expect(result.current.frame.entity.components.vitals).toEqual({
      base: 10,
      damage: 0,
    })
  })

  it("buffers a dispatch racing the bootstrap and replays it through the replica", async () => {
    let releaseBootstrap!: () => void
    acceptedAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseBootstrap = () => resolve(accepted(baseComponents))
        })
    )

    const { result } = renderHook(() => useEntityWrite(), { wrapper })
    await act(async () => {
      result.current.dispatch(damage)
    })
    expect(pushAction).not.toHaveBeenCalled()

    await act(async () => {
      releaseBootstrap()
    })
    await flush()
    expect(pushAction).toHaveBeenCalledTimes(1)
  })
})

describe("EntityWriteProvider — unmount saves outlive provider cleanup (Codex P1, PR #386)", () => {
  it("delivers a mutate fired after cleanup in the same commit — teardown yields a macrotask", async () => {
    const { result, unmount } = renderHook(() => useEntityWrite(), { wrapper })
    await flush()

    // Deletion cleanups run parent-first: the provider tears down before a
    // dirty field's unmount auto-save fires. Simulate that child cleanup by
    // dispatching immediately after unmount, same tick.
    unmount()
    result.current.dispatch(damage)

    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(pushAction).toHaveBeenCalledTimes(1)
  })

  it("flushes a buffered unmount save through a short-lived replica when torn down mid-bootstrap", async () => {
    let releaseBootstrap!: () => void
    acceptedAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releaseBootstrap = () => resolve(accepted(baseComponents))
        })
    )

    const { result, unmount } = renderHook(() => useEntityWrite(), { wrapper })
    await act(async () => {
      result.current.dispatch(damage)
    })
    unmount()
    expect(pushAction).not.toHaveBeenCalled()

    await act(async () => {
      releaseBootstrap()
      await new Promise((resolve) => setTimeout(resolve, 10))
    })
    expect(pushAction).toHaveBeenCalledTimes(1)
  })
})

describe("EntityWriteProvider — cross-writer reconcile channel (UNN-569 → UNN-645)", () => {
  it("subscribes to the character channel by the profile's shortId", async () => {
    renderHook(() => useEntityWrite(), { wrapper })
    await flush()
    expect(capturedChannel.current).toMatchObject({
      domain: "character",
      shortId: "abc123",
    })
  })

  it("fans a ping into the replica transport (a fresh refetch) AND the classic refresh compare", async () => {
    renderHook(() => useEntityWrite(), { wrapper })
    await flush()
    const bootstrapReads = acceptedAction.mock.calls.length

    await act(async () => {
      capturedChannel.current?.onPing({
        kind: "entity",
        versions: { vitals: 9 },
      })
    })
    await flush()

    expect(acceptedAction.mock.calls.length).toBeGreaterThan(bootstrapReads)
    expect(routerRefresh).toHaveBeenCalledTimes(1)
  })

  it("suppresses echoes in the refresh compare: nothing fresher never refreshes", async () => {
    renderHook(() => useEntityWrite(), { wrapper })
    await flush()

    await act(async () => {
      capturedChannel.current?.onPing({
        kind: "entity",
        versions: { vitals: 1 },
      })
    })

    expect(routerRefresh).not.toHaveBeenCalled()
  })

  it("refreshes and re-pulls once a dropped connection comes back", async () => {
    renderHook(() => useEntityWrite(), { wrapper })
    await flush()
    const bootstrapReads = acceptedAction.mock.calls.length

    await act(async () => {
      capturedChannel.current?.onReconnect?.()
    })
    await flush()

    expect(routerRefresh).toHaveBeenCalledTimes(1)
    expect(acceptedAction.mock.calls.length).toBeGreaterThan(bootstrapReads)
  })
})

describe("EntityWriteProvider — read-only mounts", () => {
  it("never bootstraps the replica when not writable", async () => {
    const readOnly = ({ children }: { children: React.ReactNode }) => (
      <EntityWriteProvider loaded={loaded} writable={false}>
        {children}
      </EntityWriteProvider>
    )
    const { result } = renderHook(() => useLoadedCharacter(), {
      wrapper: readOnly,
    })
    await flush()

    expect(acceptedAction).not.toHaveBeenCalled()
    expect(result.current.entity).toBe(loaded.entity)
  })
})

describe("useEntityIdentityQueue — the classic lifecycle path (unchanged this increment)", () => {
  it("keeps the identity queue serialized with token accounting", async () => {
    const first = vi.fn(
      (
        expectedVersion: number
      ): Promise<
        import("@workspace/result").Result<{ version: number }, never>
      > => Promise.resolve(ok({ version: expectedVersion + 1 }))
    )
    const second = vi.fn(
      (
        expectedVersion: number
      ): Promise<
        import("@workspace/result").Result<{ version: number }, never>
      > => Promise.resolve(ok({ version: expectedVersion + 1 }))
    )

    const { result } = renderHook(() => useEntityIdentityQueue(), { wrapper })
    await flush()

    await act(async () => {
      await Promise.all([
        result.current.enqueueOnce(first),
        result.current.enqueueOnce(second),
      ])
    })

    // Serialized: the second read the token the first bumped.
    expect(first).toHaveBeenCalledWith(1)
    expect(second).toHaveBeenCalledWith(2)
  })
})
