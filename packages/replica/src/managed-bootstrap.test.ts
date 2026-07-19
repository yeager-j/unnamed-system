import { describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import { createManagedBootstrap } from "./managed"
import type { MutationInvocation } from "./mutations"
import type { ReplicaTransport } from "./transport"

interface State {
  readonly value: number
}

type Invocation = MutationInvocation<"increment", Record<string, never>>

const identity = { clientGroupId: "root:1", clientId: "client:1" }
const accepted = { value: { value: 1 }, through: 0, cursor: 3 }
const transport = {} as ReplicaTransport<
  State,
  Invocation,
  "refused",
  void,
  number
>

describe("createManagedBootstrap", () => {
  it("orders identity, accepted load, and transport construction", async () => {
    const calls: string[] = []
    const bootstrap = createManagedBootstrap<
      State,
      Invocation,
      "refused",
      void,
      number,
      "gone"
    >({
      mintIdentity() {
        calls.push("identity")
        return identity
      },
      async loadAccepted(received) {
        calls.push(`load:${received.clientId}`)
        return ok(accepted)
      },
      createTransport(received, floor) {
        calls.push(`transport:${received.clientId}:${floor.cursor}`)
        return transport
      },
    })

    await expect(bootstrap(new AbortController().signal)).resolves.toEqual(
      ok({ identity, initial: accepted, transport })
    )
    expect(calls).toEqual(["identity", "load:client:1", "transport:client:1:3"])
  })

  it("classifies a typed load refusal as unavailable", async () => {
    const createTransport = vi.fn()
    const bootstrap = createManagedBootstrap<
      State,
      Invocation,
      "refused",
      void,
      number,
      "gone"
    >({
      mintIdentity: () => identity,
      loadAccepted: async () => err("gone"),
      createTransport,
    })

    await expect(bootstrap(new AbortController().signal)).resolves.toEqual(
      err({ kind: "unavailable", reason: "gone" })
    )
    expect(createTransport).not.toHaveBeenCalled()
  })

  it("leaves thrown adapter failures to the caller's policy boundary", async () => {
    const cause = new Error("offline")
    const bootstrap = createManagedBootstrap<
      State,
      Invocation,
      "refused",
      void,
      number,
      "gone"
    >({
      mintIdentity: () => identity,
      loadAccepted: async () => {
        throw cause
      },
      createTransport: () => transport,
    })

    await expect(bootstrap(new AbortController().signal)).rejects.toBe(cause)
  })
})
