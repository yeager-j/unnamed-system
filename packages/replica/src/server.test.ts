import { describe, expect, it, vi } from "vitest"

import { err, ok, type Result } from "@workspace/result"

import type { MutationEnvelope } from "./protocol"
import {
  addEntry,
  ledgerMutations,
  type Ledger,
  type LedgerError,
  type LedgerInvocation,
} from "./reference/ledger"
import {
  createMutationProcessor,
  createMutationPushDoor,
  type MutationProcessor,
  type ProcessorEvent,
} from "./server"
import type { StandardSchemaV1 } from "./standard-schema"

interface DoorInput {
  readonly rootId: string
  readonly envelope: MutationEnvelope<{
    readonly name: string
    readonly args: unknown
  }>
}

interface DoorContext {
  readonly authorization: Result<unknown, string>
  committed?: { readonly rootId: string }
}

const envelope = {
  clientGroupId: "g",
  clientId: "c",
  mutationId: 1,
  invocation: { name: "ledger.add", args: { entry: "x" } },
} as const

const doorInput = { rootId: "root-1", envelope }

const doorSchema: StandardSchemaV1<unknown, DoorInput> = {
  "~standard": {
    version: 1,
    vendor: "test",
    validate(value) {
      if (
        typeof value === "object" &&
        value !== null &&
        "rootId" in value &&
        "envelope" in value
      ) {
        return { value: value as DoorInput }
      }
      return { issues: [{ message: "invalid door input" }] }
    },
  },
}

describe("createMutationPushDoor", () => {
  it("returns the configured input refusal before preparing any trusted context", async () => {
    const prepare = vi.fn()
    const createProcessor = vi.fn()
    const afterCommit = vi.fn()
    const push = createMutationPushDoor({
      schema: doorSchema,
      invalidInput: "invalid-input" as const,
      prepare,
      createProcessor,
      afterCommit,
    })

    const result = await push({ malformed: true })

    expect(result).toEqual(err("invalid-input"))
    expect(prepare).not.toHaveBeenCalled()
    expect(createProcessor).not.toHaveBeenCalled()
    expect(afterCommit).not.toHaveBeenCalled()
  })

  it("prepares a typed refusal before processing and passes the processor result through", async () => {
    const order: string[] = []
    const authorization = err("forbidden")
    const processor: MutationProcessor<DoorContext, string, void> = async (
      received,
      context
    ) => {
      order.push("process")
      expect(received).toEqual(envelope)
      expect(context.authorization).toEqual(authorization)
      return err({ kind: "rejected", error: "forbidden" })
    }
    const afterCommit = vi.fn()
    const push = createMutationPushDoor({
      schema: doorSchema,
      invalidInput: "invalid-input" as const,
      prepare: () => {
        order.push("prepare")
        return { authorization }
      },
      createProcessor: () => {
        order.push("create-processor")
        return processor
      },
      afterCommit,
    })

    const result = await push(doorInput)

    expect(result).toEqual(err({ kind: "rejected", error: "forbidden" }))
    expect(order).toEqual(["prepare", "create-processor", "process"])
    expect(afterCommit).not.toHaveBeenCalled()
  })

  it("preserves a non-void remote and awaits effects for an executed commit", async () => {
    let releaseEffect: (() => void) | undefined
    let resolved = false
    const context: DoorContext = { authorization: ok(undefined) }
    const processor: MutationProcessor<
      DoorContext,
      string,
      { readonly version: number }
    > = async (_received, receivedContext) => {
      receivedContext.committed = { rootId: "root-1" }
      return ok({ version: 7 })
    }
    const afterCommit = vi.fn(
      () =>
        new Promise<void>((resolve) => {
          releaseEffect = resolve
        })
    )
    const push = createMutationPushDoor({
      schema: doorSchema,
      invalidInput: "invalid-input" as const,
      prepare: () => context,
      createProcessor: () => processor,
      afterCommit,
    })

    const pending = push(doorInput).then((result) => {
      resolved = true
      return result
    })
    await vi.waitFor(() => expect(afterCommit).toHaveBeenCalled())

    expect(resolved).toBe(false)
    expect(afterCommit).toHaveBeenCalledWith(
      { rootId: "root-1" },
      doorInput,
      context
    )
    releaseEffect?.()
    await expect(pending).resolves.toEqual(ok({ version: 7 }))
  })

  it("returns a deduplicated remote without repeating committed effects", async () => {
    const afterCommit = vi.fn()
    const push = createMutationPushDoor({
      schema: doorSchema,
      invalidInput: "invalid-input" as const,
      prepare: () => ({ authorization: ok(undefined) }),
      createProcessor: () => async () => ok({ version: 5 }),
      afterCommit,
    })

    const result = await push(doorInput)

    expect(result).toEqual(ok({ version: 5 }))
    expect(afterCommit).not.toHaveBeenCalled()
  })
})

/**
 * The evicting-adapter contract (Codex P2, PR #385): an adapter that returns
 * `null` from `acquire` (no record, retention cannot rule out a sweep) must
 * see the processor refuse `unknown-client` for EVERY mutation ID — most
 * critically ID 1, where "swept ledger, redelivered first mutation that may
 * already have committed" is indistinguishable from a first delivery. The
 * refusal must precede application code and record nothing.
 */
describe("createMutationProcessor — evicting dedup adapters", () => {
  it("refuses unknown-client on a null acquire, even for mutation 1, without executing or recording", async () => {
    const events: ProcessorEvent[] = []
    const execute = vi.fn()
    const record = vi.fn()
    const processor = createMutationProcessor<
      Ledger,
      LedgerInvocation,
      Record<string, never>,
      undefined,
      LedgerError,
      void
    >({
      mutations: ledgerMutations,
      transact: (work) => work({}),
      dedup: { acquire: () => Promise.resolve(null), record },
      execute,
      onEvent: (event) => {
        events.push(event)
      },
    })

    const client = { clientGroupId: "g", clientId: "c" }
    const result = await processor(
      { ...client, mutationId: 1, invocation: addEntry({ entry: "x" }) },
      undefined
    )

    expect(result).toEqual(err({ kind: "unknown-client", received: 1 }))
    expect(execute).not.toHaveBeenCalled()
    expect(record).not.toHaveBeenCalled()
    expect(events).toEqual([{ kind: "unknown-client", client, received: 1 }])
  })
})
