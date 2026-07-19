import fc from "fast-check"
import { afterEach, describe, expect, it, vi } from "vitest"

import { err, ok } from "@workspace/result"

import {
  createManagedReplica,
  type ManagedBootstrapFailure,
  type ManagedBootstrapResult,
  type ManagedMutationReceipt,
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
import type { ReplicaTransportSink } from "./transport"

type Setup = ManagedReplicaSetup<
  Ledger,
  LedgerInvocation,
  LedgerError,
  void,
  number
>
type Bootstrap = ManagedBootstrapResult<
  Ledger,
  LedgerInvocation,
  LedgerError,
  void,
  number,
  string
>
type Receipt = ManagedMutationReceipt<LedgerError, void, string>

type Operation =
  | "mutate"
  | "bootstrap-success"
  | "bootstrap-retryable"
  | "bootstrap-unavailable"
  | "advance-retry"
  | "dispose"
  | "advance-disposal"
  | "expire"
  | "down"
  | "alive"
  | "accept"

interface ReferenceModel {
  status:
    | "bootstrapping"
    | "retrying"
    | "ready"
    | "expired"
    | "unavailable"
    | "disposing"
    | "disposed"
  connection: "connected" | "disconnected"
  liveTransports: number
}

interface PendingBootstrap {
  readonly resolve: (result: Bootstrap) => void
}

function createHarness(leakDisconnect = false) {
  let pendingBootstrap: PendingBootstrap | null = null
  let sink: ReplicaTransportSink<Ledger, number> | null = null
  let liveTransports = 0
  let identity = 0
  let cursor = 0
  let expireNext = false
  const receipts: Receipt[] = []

  const managed = createManagedReplica<
    Ledger,
    LedgerInvocation,
    LedgerError,
    void,
    number,
    string
  >({
    mutations: ledgerMutations,
    bootstrap: () =>
      new Promise<Bootstrap>((resolve) => {
        pendingBootstrap = { resolve }
      }),
    onEvent: () => {
      throw new Error("metrics failed")
    },
    onAccepted: () => {
      throw new Error("refresh failed")
    },
    onExpired: () => {
      throw new Error("toast failed")
    },
    onUnavailable: () => {
      throw new Error("routing failed")
    },
  })

  function setup(): Setup {
    identity += 1
    return {
      identity: { clientGroupId: "model", clientId: `client-${identity}` },
      initial: { value: LEDGER_INITIAL, through: 0, cursor },
      transport: {
        connect(nextSink) {
          sink = nextSink
          liveTransports += 1
          return () => {
            sink = null
            if (!leakDisconnect) liveTransports -= 1
          }
        },
        async push() {
          if (expireNext) {
            expireNext = false
            return err({ kind: "unknown-client" as const })
          }
          return ok(undefined)
        },
      },
    }
  }

  return {
    managed,
    receipts,
    hasPendingBootstrap: () => pendingBootstrap !== null,
    resolveBootstrap(result: Bootstrap) {
      const pending = pendingBootstrap
      pendingBootstrap = null
      pending?.resolve(result)
    },
    setup,
    mutate() {
      receipts.push(
        managed.mutate(addEntry({ entry: `entry-${receipts.length}` }))
      )
    },
    expire() {
      expireNext = true
      const receipt = managed.mutate(addEntry({ entry: "expire" }))
      receipts.push(receipt)
      return receipt.remote
    },
    down: () => sink?.down(),
    alive: () => sink?.alive(),
    accept() {
      cursor += 1
      sink?.accept({ value: LEDGER_INITIAL, through: 0, cursor })
    },
    liveTransports: () => liveTransports,
  }
}

async function flushMicrotasks(turns = 12): Promise<void> {
  for (let index = 0; index < turns; index += 1) await Promise.resolve()
}

function assertMatches(
  model: ReferenceModel,
  harness: ReturnType<typeof createHarness>
): void {
  const actual = harness.managed.getSnapshot()
  expect(actual.status).toBe(model.status)
  if (actual.status === "ready") {
    expect(actual.replica.connection).toBe(model.connection)
  }
  expect(harness.liveTransports()).toBe(model.liveTransports)
}

async function runOperations(
  operations: readonly Operation[],
  leakDisconnect = false
): Promise<void> {
  vi.useFakeTimers()
  const harness = createHarness(leakDisconnect)
  const model: ReferenceModel = {
    status: "bootstrapping",
    connection: "connected",
    liveTransports: 0,
  }
  await flushMicrotasks()
  assertMatches(model, harness)

  for (const operation of operations) {
    switch (operation) {
      case "mutate":
        harness.mutate()
        break
      case "bootstrap-success":
        if (
          harness.hasPendingBootstrap() &&
          (model.status === "bootstrapping" ||
            model.status === "retrying" ||
            model.status === "expired")
        ) {
          harness.resolveBootstrap(ok(harness.setup()))
          await flushMicrotasks()
          model.status = "ready"
          model.connection = "connected"
          model.liveTransports = 1
        }
        break
      case "bootstrap-retryable":
        if (
          harness.hasPendingBootstrap() &&
          (model.status === "bootstrapping" ||
            model.status === "retrying" ||
            model.status === "expired")
        ) {
          const failure: ManagedBootstrapFailure<string> = {
            kind: "retryable",
            cause: "model",
          }
          harness.resolveBootstrap(err(failure))
          await flushMicrotasks()
          model.status = "retrying"
        }
        break
      case "bootstrap-unavailable":
        if (
          harness.hasPendingBootstrap() &&
          (model.status === "bootstrapping" ||
            model.status === "retrying" ||
            model.status === "expired")
        ) {
          harness.resolveBootstrap(
            err({ kind: "unavailable", reason: "terminal" })
          )
          await flushMicrotasks()
          model.status = "unavailable"
        }
        break
      case "advance-retry":
        if (model.status === "retrying" && !harness.hasPendingBootstrap()) {
          await vi.advanceTimersToNextTimerAsync()
          await flushMicrotasks()
        }
        break
      case "dispose":
        if (model.status !== "disposed" && model.status !== "disposing") {
          harness.managed.dispose()
          model.status = "disposing"
        }
        break
      case "advance-disposal":
        if (model.status === "disposing") {
          await vi.advanceTimersByTimeAsync(0)
          await flushMicrotasks()
          model.status = "disposed"
          model.liveTransports = 0
        }
        break
      case "expire":
        if (model.status === "ready" && model.connection === "connected") {
          await harness.expire()
          await flushMicrotasks()
          model.status = "expired"
          model.liveTransports = 0
        }
        break
      case "down":
        if (model.status === "ready") {
          harness.down()
          model.connection = "disconnected"
        }
        break
      case "alive":
        if (model.status === "ready") {
          harness.alive()
          model.connection = "connected"
        }
        break
      case "accept":
        if (model.status === "ready") {
          harness.accept()
          model.connection = "connected"
        }
        break
    }
    await flushMicrotasks()
    assertMatches(model, harness)
  }

  if (model.status !== "disposed" && model.status !== "disposing") {
    harness.managed.dispose()
    model.status = "disposing"
  }
  if (model.status === "disposing") {
    await vi.advanceTimersByTimeAsync(0)
    await flushMicrotasks()
    model.status = "disposed"
    model.liveTransports = 0
  }
  assertMatches(model, harness)

  let receiptsSettled = false
  void Promise.allSettled(
    harness.receipts.map((receipt) => receipt.remote)
  ).then(() => {
    receiptsSettled = true
  })
  await flushMicrotasks()
  expect(receiptsSettled).toBe(true)
}

const operationArbitrary = fc.constantFrom<Operation>(
  "mutate",
  "bootstrap-success",
  "bootstrap-retryable",
  "bootstrap-unavailable",
  "advance-retry",
  "dispose",
  "advance-disposal",
  "expire",
  "down",
  "alive",
  "accept"
)

afterEach(() => {
  vi.useRealTimers()
})

describe("managed lifecycle model", () => {
  it("matches the reference model over generated lifecycle interleavings", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(operationArbitrary, { minLength: 1, maxLength: 40 }),
        async (operations) => runOperations(operations)
      )
    )
  }, 30_000)

  it("negative control detects a transport leaked by disposal", async () => {
    await expect(
      runOperations(
        ["bootstrap-success", "mutate", "dispose", "advance-disposal"],
        true
      )
    ).rejects.toThrow()
  })
})
