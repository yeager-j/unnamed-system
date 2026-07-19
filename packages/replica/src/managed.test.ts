import { describe, expect, it } from "vitest"

import { settle } from "./contract/support"
import { createInMemoryAuthority } from "./in-memory-authority"
import { createManagedReplica, type ManagedReplicaSetup } from "./index"
import {
  addEntry,
  LEDGER_INITIAL,
  ledgerMutations,
  type Ledger,
  type LedgerError,
  type LedgerInvocation,
} from "./reference/ledger"

const macrotask = (): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, 0))

type Setup = ManagedReplicaSetup<
  Ledger,
  LedgerInvocation,
  LedgerError,
  void,
  number
>

/**
 * A controllable world: one authority, one identity minted per bootstrap
 * round (the expiry-rebuild contract), and a gate on bootstrap resolution so
 * the buffering window is observable.
 */
function createWorld() {
  const authority = createInMemoryAuthority<
    Ledger,
    LedgerInvocation,
    LedgerError
  >({ mutations: ledgerMutations, initial: LEDGER_INITIAL })

  let minted = 0
  const identities: Array<{ clientGroupId: string; clientId: string }> = []
  let gated = false
  const held: Array<() => void> = []

  const bootstrap = async (): Promise<Setup> => {
    if (gated) {
      await new Promise<void>((resolve) => {
        held.push(resolve)
      })
    }
    minted += 1
    const identity = { clientGroupId: "group", clientId: `client-${minted}` }
    identities.push(identity)
    const handle = authority.transport(identity)
    return {
      identity,
      initial: handle.accepted(),
      transport: handle.transport,
    }
  }

  return {
    authority,
    bootstrap,
    identities: () => [...identities],
    gate: () => {
      gated = true
    },
    release: () => {
      gated = false
      for (const resolve of held.splice(0)) resolve()
    },
  }
}

describe("createManagedReplica", () => {
  it("buffers dispatches during the bootstrap window and replays them in order", async () => {
    const world = createWorld()
    world.gate()
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: world.bootstrap,
    })

    expect(managed.getSnapshot()).toBeNull()
    const first = managed.mutate(addEntry({ entry: "alpha" }))
    const second = managed.mutate(addEntry({ entry: "beta" }))

    world.release()
    await settle(6)

    const outcomes = await Promise.all([first.remote, second.remote])
    expect(outcomes.every((outcome) => outcome.ok)).toBe(true)
    expect(world.authority.read().entries).toEqual(["alpha", "beta"])
    expect(managed.getSnapshot()?.value.entries).toEqual(["alpha", "beta"])
    managed.dispose()
  })

  it("stays unbootstrapped on a null bootstrap and settles buffered intent disposed at teardown", async () => {
    const managed = createManagedReplica<
      Ledger,
      LedgerInvocation,
      LedgerError,
      void,
      number
    >({
      mutations: ledgerMutations,
      bootstrap: () => Promise.resolve(null),
    })
    const receipt = managed.mutate(addEntry({ entry: "orphan" }))
    await settle(3)
    expect(managed.getSnapshot()).toBeNull()

    managed.dispose()
    await macrotask()
    const remote = await receipt.remote
    expect(remote.ok).toBe(false)
    if (!remote.ok) expect(remote.error.kind).toBe("disposed")
  })

  it("treats a throwing bootstrap as unbootstrapped", async () => {
    const managed = createManagedReplica<
      Ledger,
      LedgerInvocation,
      LedgerError,
      void,
      number
    >({
      mutations: ledgerMutations,
      bootstrap: () => Promise.reject(new Error("load refused")),
    })
    await settle(3)
    expect(managed.getSnapshot()).toBeNull()
    managed.dispose()
  })

  it("rebuilds under a fresh identity on expiry and refuses the expiry window's dispatches", async () => {
    const world = createWorld()
    const expiries: number[] = []
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: world.bootstrap,
      onExpired: ({ dropped }) => {
        expiries.push(dropped)
      },
    })
    await settle(3)

    const seeded = managed.mutate(addEntry({ entry: "seed" }))
    await seeded.remote

    // The authority swept this client's ledger row: the next delivery (id 2
    // against no history) is `unknown-client`, which expires the identity.
    world.authority.forgetClient(world.identities()[0]!)
    const stranded = managed.mutate(addEntry({ entry: "stranded" }))
    const strandedOutcome = await stranded.remote
    expect(strandedOutcome.ok).toBe(false)
    if (!strandedOutcome.ok) expect(strandedOutcome.error.kind).toBe("expired")
    // Both predictions drop: `seed` was accepted but never incorporated by a
    // snapshot (the fixture world never publishes), and `stranded` is dead.
    expect(expiries).toEqual([2])

    // Dispatches during the rebuild window belong to the dead identity's
    // intent stream — refused `expired`, never silently re-issued.
    const windowed = managed.mutate(addEntry({ entry: "windowed" }))
    const windowedOutcome = await windowed.remote
    expect(windowedOutcome.ok).toBe(false)
    if (!windowedOutcome.ok) expect(windowedOutcome.error.kind).toBe("expired")

    await settle(6)
    expect(world.identities()).toHaveLength(2)
    const revived = managed.mutate(addEntry({ entry: "revived" }))
    const revivedOutcome = await revived.remote
    expect(revivedOutcome.ok).toBe(true)
    expect(world.authority.read().entries).toEqual(["seed", "revived"])
    managed.dispose()
  })

  it("keeps accepting for one macrotask after dispose, then refuses", async () => {
    const world = createWorld()
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: world.bootstrap,
    })
    await settle(3)

    managed.dispose()
    expect(managed.getSnapshot()).toBeNull()
    // Same-commit unmount flush: still finds a live replica.
    const flushed = managed.mutate(addEntry({ entry: "flush" }))
    const flushedOutcome = await flushed.remote
    expect(flushedOutcome.ok).toBe(true)
    expect(world.authority.read().entries).toEqual(["flush"])

    await macrotask()
    const late = managed.mutate(addEntry({ entry: "late" }))
    const lateOutcome = await late.remote
    expect(lateOutcome.ok).toBe(false)
    if (!lateOutcome.ok) expect(lateOutcome.error.kind).toBe("disposed")
  })

  it("drains a buffer whose bootstrap resolves after disposal through the short-lived replica", async () => {
    const world = createWorld()
    world.gate()
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: world.bootstrap,
    })
    const receipt = managed.mutate(addEntry({ entry: "unmount-save" }))
    managed.dispose()
    await macrotask()

    world.release()
    await settle(6)
    const outcome = await receipt.remote
    expect(outcome.ok).toBe(true)
    expect(world.authority.read().entries).toEqual(["unmount-save"])
  })

  it("settleMutations reports a failed remote once, then resets", async () => {
    const world = createWorld()
    const managed = createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: world.bootstrap,
    })
    await settle(3)

    world.authority.vetoNext({ kind: "vetoed" })
    const vetoed = managed.mutate(addEntry({ entry: "vetoed" }))
    await vetoed.remote
    const failed = await managed.settleMutations()
    expect(failed.ok).toBe(false)

    const clean = managed.mutate(addEntry({ entry: "clean" }))
    await clean.remote
    const settled = await managed.settleMutations()
    expect(settled.ok).toBe(true)
    managed.dispose()
  })
})
