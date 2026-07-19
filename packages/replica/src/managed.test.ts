import { afterEach, describe, expect, it, vi } from "vitest"

import { err, ok, type Result } from "@workspace/result"

import { settle } from "./contract/support"
import { createInMemoryAuthority } from "./in-memory-authority"
import {
  createManagedReplica,
  type ManagedReplica,
  type ManagedReplicaSetup,
} from "./index"
import {
  addEntry,
  LEDGER_INITIAL,
  ledgerMutations,
  type Ledger,
  type LedgerError,
  type LedgerInvocation,
} from "./reference/ledger"

type Setup = ManagedReplicaSetup<
  Ledger,
  LedgerInvocation,
  LedgerError,
  void,
  number
>

function createWorld() {
  const authority = createInMemoryAuthority<
    Ledger,
    LedgerInvocation,
    LedgerError
  >({ mutations: ledgerMutations, initial: LEDGER_INITIAL })
  let minted = 0
  const identities: Array<{ clientGroupId: string; clientId: string }> = []
  let bootstrapGated = false
  const heldBootstraps: Array<() => void> = []
  let pushesGated = false
  const heldPushes: Array<() => void> = []

  const bootstrap = async (
    _signal?: AbortSignal
  ): Promise<Result<Setup, never>> => {
    if (bootstrapGated) {
      await new Promise<void>((resolve) => heldBootstraps.push(resolve))
    }
    minted += 1
    const identity = { clientGroupId: "group", clientId: `client-${minted}` }
    identities.push(identity)
    const handle = authority.transport(identity)
    return ok({
      identity,
      initial: handle.accepted(),
      transport: {
        connect: handle.transport.connect,
        async push(envelope, signal) {
          if (pushesGated) {
            await new Promise<void>((resolve) => heldPushes.push(resolve))
          }
          return handle.transport.push(envelope, signal)
        },
      },
    })
  }

  return {
    authority,
    bootstrap,
    identities: () => [...identities],
    gateBootstrap() {
      bootstrapGated = true
    },
    releaseBootstrap() {
      bootstrapGated = false
      for (const resolve of heldBootstraps.splice(0)) resolve()
    },
    gatePushes() {
      pushesGated = true
    },
    releaseNextPush() {
      heldPushes.shift()?.()
    },
  }
}

function readyReplica(
  managed: ManagedReplica<Ledger, LedgerInvocation, LedgerError>
) {
  const state = managed.getSnapshot()
  expect(state.status).toBe("ready")
  if (state.status !== "ready")
    throw new Error("expected ready managed replica")
  return state.replica
}

async function flushMicrotasks(turns = 10): Promise<void> {
  for (let index = 0; index < turns; index += 1) await Promise.resolve()
}

afterEach(() => {
  vi.useRealTimers()
})

describe("createManagedReplica", () => {
  it("publishes explicit state and buffers dispatches in order", async () => {
    const world = createWorld()
    world.gateBootstrap()
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: world.bootstrap,
    })

    expect(managed.getSnapshot()).toEqual({ status: "bootstrapping" })
    const first = managed.mutate(addEntry({ entry: "alpha" }))
    const second = managed.mutate(addEntry({ entry: "beta" }))
    expect("id" in first).toBe(false)

    world.releaseBootstrap()
    await settle(6)

    expect((await first.remote).ok).toBe(true)
    expect((await second.remote).ok).toBe(true)
    expect(world.authority.read().entries).toEqual(["alpha", "beta"])
    expect(readyReplica(managed).value.entries).toEqual(["alpha", "beta"])
    managed.dispose()
  })

  it("preserves a typed terminal reason and isolates unavailable callbacks", async () => {
    const observed: string[] = []
    const managed = createManagedReplica<
      Ledger,
      LedgerInvocation,
      LedgerError,
      void,
      number,
      "not-live"
    >({
      mutations: ledgerMutations,
      bootstrap: () =>
        Promise.resolve(
          err({ kind: "unavailable" as const, reason: "not-live" as const })
        ),
      onUnavailable: (failure) => {
        observed.push(failure.kind)
        throw new Error("router callback failed")
      },
    })
    const buffered = managed.mutate(addEntry({ entry: "orphan" }))
    await settle(3)

    expect(managed.getSnapshot()).toEqual({
      status: "unavailable",
      failure: { kind: "terminal", reason: "not-live" },
    })
    const remote = await buffered.remote
    expect(remote).toEqual(
      err({
        kind: "unavailable",
        failure: { kind: "terminal", reason: "not-live" },
      })
    )
    expect(observed).toEqual(["terminal"])
    managed.dispose()
  })

  it("times out an attempt, publishes retrying, and aborts its signal", async () => {
    vi.useFakeTimers()
    let aborted = false
    const managed = createManagedReplica<
      Ledger,
      LedgerInvocation,
      LedgerError,
      void,
      number
    >({
      mutations: ledgerMutations,
      bootstrap: (signal) =>
        new Promise((resolve) => {
          signal.addEventListener("abort", () => {
            aborted = true
          })
          void resolve
        }),
    })

    await vi.advanceTimersByTimeAsync(10_000)
    expect(aborted).toBe(true)
    expect(managed.getSnapshot()).toMatchObject({
      status: "retrying",
      attempt: 2,
      maxAttempts: 6,
    })
    managed.dispose()
    await vi.runAllTimersAsync()
  })

  it("retries with package-owned backoff and adopts the successful attempt", async () => {
    vi.useFakeTimers()
    const world = createWorld()
    let attempts = 0
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: async (signal) => {
        attempts += 1
        if (attempts < 3) return err({ kind: "retryable" as const })
        return world.bootstrap(signal)
      },
    })
    const buffered = managed.mutate(addEntry({ entry: "survived" }))

    await vi.advanceTimersByTimeAsync(750)
    await flushMicrotasks()

    expect(attempts).toBe(3)
    expect((await buffered.remote).ok).toBe(true)
    expect(managed.getSnapshot().status).toBe("ready")
    managed.dispose()
    await vi.runAllTimersAsync()
  })

  it("settles the buffer with retry exhaustion after six attempts", async () => {
    vi.useFakeTimers()
    let attempts = 0
    const managed = createManagedReplica<
      Ledger,
      LedgerInvocation,
      LedgerError,
      void,
      number
    >({
      mutations: ledgerMutations,
      bootstrap: async () => {
        attempts += 1
        return err({ kind: "retryable" as const, cause: attempts })
      },
    })
    const buffered = managed.mutate(addEntry({ entry: "doomed" }))

    await vi.runAllTimersAsync()
    await flushMicrotasks()

    expect(attempts).toBe(6)
    expect(managed.getSnapshot()).toEqual({
      status: "unavailable",
      failure: { kind: "retry-exhausted", attempts: 6, cause: 6 },
    })
    const remote = await buffered.remote
    expect(remote.ok).toBe(false)
    if (!remote.ok) expect(remote.error.kind).toBe("unavailable")
    managed.dispose()
    await vi.runAllTimersAsync()
  })

  it("isolates subscribers and callbacks from an expiry rebuild", async () => {
    const world = createWorld()
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: world.bootstrap,
      onEvent: () => {
        throw new Error("logger failed")
      },
      onExpired: () => {
        throw new Error("toast failed")
      },
    })
    managed.subscribe(() => {
      throw new Error("subscriber failed")
    })
    await settle(3)

    await managed.mutate(addEntry({ entry: "seed" })).remote
    world.authority.forgetClient(world.identities()[0]!)
    await managed.mutate(addEntry({ entry: "stranded" })).remote
    await settle(6)

    expect(world.identities()).toHaveLength(2)
    expect(
      (await managed.mutate(addEntry({ entry: "revived" })).remote).ok
    ).toBe(true)
    managed.dispose()
  })

  it("does not rebuild when expiry races the disposal grace", async () => {
    const world = createWorld()
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: world.bootstrap,
    })
    await settle(3)
    await managed.mutate(addEntry({ entry: "seed" })).remote
    world.authority.forgetClient(world.identities()[0]!)

    const expiring = managed.mutate(addEntry({ entry: "stranded" }))
    managed.dispose()
    await expiring.remote
    await new Promise((resolve) => setTimeout(resolve, 0))
    await settle(4)

    expect(world.identities()).toHaveLength(1)
    expect(world.authority.liveTransports()).toBe(0)
    expect(managed.getSnapshot()).toEqual({ status: "disposed" })
  })

  it("accepts ready flushes for one macrotask, then refuses", async () => {
    const world = createWorld()
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: world.bootstrap,
    })
    await settle(3)

    managed.dispose()
    expect(managed.getSnapshot()).toEqual({ status: "disposing" })
    const flushed = managed.mutate(addEntry({ entry: "flush" }))
    expect((await flushed.remote).ok).toBe(true)
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(managed.getSnapshot()).toEqual({ status: "disposed" })
    const late = await managed.mutate(addEntry({ entry: "late" })).remote
    expect(late).toEqual(err({ kind: "disposed" }))
  })

  it("settles a pre-bootstrap buffer at grace expiry and ignores late success", async () => {
    const world = createWorld()
    world.gateBootstrap()
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: world.bootstrap,
    })
    const receipt = managed.mutate(addEntry({ entry: "unmount-save" }))
    managed.dispose()
    await new Promise((resolve) => setTimeout(resolve, 0))

    expect(await receipt.remote).toEqual(err({ kind: "disposed" }))
    world.releaseBootstrap()
    await settle(6)

    expect(managed.getSnapshot()).toEqual({ status: "disposed" })
    expect(world.authority.liveTransports()).toBe(0)
    expect(world.authority.read().entries).toEqual([])
  })

  it("uses call-time settlement barriers and does not absorb later writes", async () => {
    const world = createWorld()
    world.gatePushes()
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: world.bootstrap,
    })
    await settle(3)

    managed.mutate(addEntry({ entry: "before" }))
    await settle(2)
    const barrier = managed.settleMutations()
    const later = managed.mutate(addEntry({ entry: "after" }))
    world.releaseNextPush()
    await settle(6)

    expect(await barrier).toEqual(ok(undefined))
    let laterSettled = false
    void later.remote.then(() => {
      laterSettled = true
    })
    await settle(2)
    expect(laterSettled).toBe(false)

    managed.dispose()
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(await later.remote).toEqual(err({ kind: "disposed" }))
  })

  it("reports a failed barrier once and resets", async () => {
    const world = createWorld()
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: world.bootstrap,
    })
    await settle(3)

    world.authority.vetoNext({ kind: "vetoed" })
    await managed.mutate(addEntry({ entry: "vetoed" })).remote
    expect((await managed.settleMutations()).ok).toBe(false)
    expect(await managed.settleMutations()).toEqual(ok(undefined))
    managed.dispose()
  })
})
