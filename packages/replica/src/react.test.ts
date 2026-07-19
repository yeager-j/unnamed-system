// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react"
import {
  createElement,
  StrictMode,
  useEffect,
  useLayoutEffect,
  useRef,
  type ReactNode,
} from "react"
import { describe, expect, it } from "vitest"

import { err, ok } from "@workspace/result"

import { createInMemoryAuthority } from "./in-memory-authority"
import { createManagedReplica } from "./managed"
import { useManagedReplica } from "./react"
import {
  addEntry,
  LEDGER_INITIAL,
  ledgerMutations,
  type Ledger,
  type LedgerError,
  type LedgerInvocation,
} from "./reference/ledger"

function createWorld() {
  const authority = createInMemoryAuthority<
    Ledger,
    LedgerInvocation,
    LedgerError
  >({ mutations: ledgerMutations, initial: LEDGER_INITIAL })
  let identities = 0
  let bootstrapGated = false
  const held: Array<() => void> = []

  const create = () =>
    createManagedReplica({
      mutations: ledgerMutations,
      bootstrap: async () => {
        if (bootstrapGated) {
          await new Promise<void>((resolve) => held.push(resolve))
        }
        identities += 1
        const identity = {
          clientGroupId: "react",
          clientId: `client-${identities}`,
        }
        const handle = authority.transport(identity)
        return ok({
          identity,
          initial: handle.accepted(),
          transport: handle.transport,
        })
      },
    })

  return {
    authority,
    create,
    identityCount: () => identities,
    gateBootstrap() {
      bootstrapGated = true
    },
    releaseBootstrap() {
      bootstrapGated = false
      for (const resolve of held.splice(0)) resolve()
    },
  }
}

async function flush(): Promise<void> {
  await act(async () => {
    await Promise.resolve()
    await new Promise((resolve) => setTimeout(resolve, 0))
  })
}

describe("useManagedReplica", () => {
  it("buffers a layout-effect dispatch before the controller effect", async () => {
    const world = createWorld()
    let remote: Promise<unknown> | undefined
    const rendered = renderHook(() => {
      const managed = useManagedReplica({ enabled: true, create: world.create })
      const dispatched = useRef(false)
      useLayoutEffect(() => {
        if (dispatched.current) return
        dispatched.current = true
        remote = managed.mutate(addEntry({ entry: "pre-effect" })).remote
      })
      return managed
    })

    await flush()
    expect(await remote).toEqual(ok(undefined))
    expect(rendered.result.current.state.status).toBe("ready")
    expect(world.authority.read().entries).toEqual(["pre-effect"])
    rendered.unmount()
  })

  it("reports a pre-effect failure to only the barrier that captured it", async () => {
    const world = createWorld()
    world.authority.vetoNext({ kind: "vetoed" })
    let settled: Promise<unknown> | undefined
    const rendered = renderHook(() => {
      const managed = useManagedReplica({ enabled: true, create: world.create })
      const dispatched = useRef(false)
      useLayoutEffect(() => {
        if (dispatched.current) return
        dispatched.current = true
        managed.mutate(addEntry({ entry: "vetoed" }))
        settled = managed.settleMutations()
      })
      return managed
    })

    await flush()
    expect(await settled).toEqual(err("pending-write-failed"))
    expect(await rendered.result.current.settleMutations()).toEqual(
      ok(undefined)
    )
    rendered.unmount()
  })

  it("keeps only the active controller alive across Strict Mode effect replacement", async () => {
    const world = createWorld()
    const wrapper = ({ children }: { children: ReactNode }) =>
      createElement(StrictMode, null, children)
    const rendered = renderHook(
      (props: { create: typeof world.create }) =>
        useManagedReplica({ enabled: true, create: props.create }),
      { wrapper, initialProps: { create: world.create } }
    )

    await flush()
    rendered.rerender({ create: () => world.create() })
    await flush()
    expect(world.identityCount()).toBe(2)
    expect(world.authority.liveTransports()).toBe(1)
    expect(rendered.result.current.state.status).toBe("ready")

    rendered.unmount()
    await flush()
    expect(world.authority.liveTransports()).toBe(0)
  })

  it("allows a same-commit child cleanup flush", async () => {
    const world = createWorld()
    let remote: Promise<unknown> | undefined
    const rendered = renderHook(() => {
      const managed = useManagedReplica({ enabled: true, create: world.create })
      const mutateRef = useRef(managed.mutate)
      mutateRef.current = managed.mutate
      useEffect(
        () => () => {
          remote = mutateRef.current(addEntry({ entry: "unmount" })).remote
        },
        []
      )
      return managed
    })
    await flush()

    rendered.unmount()
    expect(await remote).toEqual(ok(undefined))
    expect(world.authority.read().entries).toEqual(["unmount"])
    await flush()
    expect(world.authority.liveTransports()).toBe(0)
  })

  it("never bootstraps a disabled mount and settles writes disposed", async () => {
    const world = createWorld()
    const rendered = renderHook(() =>
      useManagedReplica({ enabled: false, create: world.create })
    )

    expect(rendered.result.current.state).toEqual({ status: "disposed" })
    const receipt = rendered.result.current.mutate(
      addEntry({ entry: "read-only" })
    )
    expect(await receipt.remote).toEqual(err({ kind: "disposed" }))
    expect(await rendered.result.current.settleMutations()).toEqual(
      err("pending-write-failed")
    )
    expect(world.identityCount()).toBe(0)
    rendered.unmount()
  })

  it("settles a pre-effect write when unmounted before bootstrap resolves", async () => {
    const world = createWorld()
    world.gateBootstrap()
    let remote: Promise<unknown> | undefined
    const rendered = renderHook(() => {
      const managed = useManagedReplica({ enabled: true, create: world.create })
      const dispatched = useRef(false)
      useLayoutEffect(() => {
        if (dispatched.current) return
        dispatched.current = true
        remote = managed.mutate(addEntry({ entry: "abandoned" })).remote
      })
      return managed
    })

    rendered.unmount()
    await flush()
    expect(await remote).toEqual(err({ kind: "disposed" }))
    world.releaseBootstrap()
    await flush()
    expect(world.authority.liveTransports()).toBe(0)
    expect(world.authority.read().entries).toEqual([])
  })
})
