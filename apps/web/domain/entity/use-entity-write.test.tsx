// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import { beforeEach, describe, expect, it, vi } from "vitest"

import type { Entity } from "@workspace/game-v2/kernel/entity"
import { err, ok, type Result } from "@workspace/result"

import type { CharacterProfile, LoadedCharacter } from "@/domain/character/load"
import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import { resolveEntity } from "@/domain/game-engine-v2"
import { pushEntityMutationAction } from "@/lib/actions/entity/replica/push"
import { loadEntityAcceptedAction } from "@/lib/actions/entity/replica/snapshot"
import { getEntityClassVersionAction } from "@/lib/actions/entity/versions"

import {
  EntityWriteProvider,
  useEntityColumnWrite,
  useEntityIdentityAction,
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
const versionAction = vi.mocked(getEntityClassVersionAction)
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
    value: {
      components,
      columns: {
        name: profile.name,
        portraitUrl: profile.portraitUrl,
        pronouns: profile.pronouns,
        notes: profile.notes,
      },
    },
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
  versionAction.mockReset().mockResolvedValue(ok({ version: 7 }))
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

describe("useEntityColumnWrite — replayable column intent (UNN-648)", () => {
  it("projects name into the profile and lifted identity component", async () => {
    const { result } = renderHook(
      () => ({ write: useEntityColumnWrite(), frame: useLoadedCharacter() }),
      { wrapper }
    )
    await flush()

    await act(async () => {
      result.current.write.dispatch({ column: "name", value: "  New Name  " })
    })
    await flush()

    expect(result.current.frame.profile.name).toBe("New Name")
    expect(result.current.frame.entity.components.identity).toEqual({
      name: "New Name",
    })
    const invocation = (
      pushAction.mock.calls[0]![0] as {
        envelope: { invocation: { name: string; args: unknown } }
      }
    ).envelope.invocation
    expect(invocation).toEqual({
      name: "entity.setColumn",
      args: { column: "name", value: "New Name" },
    })
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

describe("useEntityIdentityAction — preconditioned lifecycle seam (UNN-648)", () => {
  it("waits for replica writes, captures a fresh version, and executes once", async () => {
    let releasePush!: () => void
    pushAction.mockImplementationOnce(
      () =>
        new Promise((resolve) => {
          releasePush = () => resolve(ok(undefined))
        })
    )
    const action = vi.fn((expectedVersion: number) =>
      Promise.resolve(ok({ version: expectedVersion + 1 }))
    )
    const { result } = renderHook(
      () => ({ write: useEntityWrite(), lifecycle: useEntityIdentityAction() }),
      { wrapper }
    )
    await flush()

    result.current.write.dispatch(damage)
    const lifecycleResult = result.current.lifecycle.runOnce(action)
    await flush()
    expect(action).not.toHaveBeenCalled()

    releasePush()
    await expect(lifecycleResult).resolves.toEqual(ok({ version: 8 }))
    expect(versionAction).toHaveBeenCalledWith({
      entityId: "char-1",
      versionClass: "identity",
    })
    expect(action).toHaveBeenCalledTimes(1)
    expect(action).toHaveBeenCalledWith(7)
  })

  it("does not execute when a pending replica write failed", async () => {
    pushAction.mockResolvedValueOnce(
      err({ kind: "rejected", error: "capability-missing" })
    )
    const action = vi.fn(() => Promise.resolve(ok(undefined)))
    const { result } = renderHook(
      () => ({ write: useEntityWrite(), lifecycle: useEntityIdentityAction() }),
      { wrapper }
    )
    await flush()

    result.current.write.dispatch(damage)
    await flush()
    await expect(result.current.lifecycle.runOnce(action)).resolves.toEqual(
      err("identity-precondition-unavailable")
    )
    expect(versionAction).not.toHaveBeenCalled()
    expect(action).not.toHaveBeenCalled()
  })

  it("does not poison a later lifecycle attempt after reporting the failure", async () => {
    pushAction.mockResolvedValueOnce(
      err({ kind: "rejected", error: "capability-missing" })
    )
    const action = vi.fn(() => Promise.resolve(ok(undefined)))
    const { result } = renderHook(
      () => ({ write: useEntityWrite(), lifecycle: useEntityIdentityAction() }),
      { wrapper }
    )
    await flush()

    result.current.write.dispatch(damage)
    await flush()
    await expect(result.current.lifecycle.runOnce(action)).resolves.toEqual(
      err("identity-precondition-unavailable")
    )
    await expect(result.current.lifecycle.runOnce(action)).resolves.toEqual(
      ok(undefined)
    )

    expect(versionAction).toHaveBeenCalledTimes(1)
    expect(action).toHaveBeenCalledTimes(1)
  })

  it("does not execute when the identity precondition cannot be captured", async () => {
    versionAction.mockResolvedValueOnce(err("invalid-input"))
    const action = vi.fn(() => Promise.resolve(ok(undefined)))
    const { result } = renderHook(() => useEntityIdentityAction(), { wrapper })
    await flush()

    await expect(result.current.runOnce(action)).resolves.toEqual(
      err("identity-precondition-unavailable")
    )
    expect(action).not.toHaveBeenCalled()
  })

  it("serializes lifecycle actions without retrying either one", async () => {
    let releaseFirst!: () => void
    const first = vi.fn(
      () =>
        new Promise<Result<void, never>>((resolve) => {
          releaseFirst = () => resolve(ok(undefined))
        })
    )
    const second = vi.fn(() => Promise.resolve(ok(undefined)))
    const { result } = renderHook(() => useEntityIdentityAction(), { wrapper })
    await flush()

    const firstResult = result.current.runOnce(first)
    const secondResult = result.current.runOnce(second)
    await flush()
    expect(first).toHaveBeenCalledTimes(1)
    expect(second).not.toHaveBeenCalled()

    releaseFirst()
    await expect(firstResult).resolves.toEqual(ok(undefined))
    await expect(secondResult).resolves.toEqual(ok(undefined))
    expect(second).toHaveBeenCalledTimes(1)
    expect(versionAction).toHaveBeenCalledTimes(2)
  })
})
