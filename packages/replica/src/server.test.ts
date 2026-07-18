import { describe, expect, it, vi } from "vitest"

import { err } from "@workspace/result"

import {
  addEntry,
  ledgerMutations,
  type Ledger,
  type LedgerError,
  type LedgerInvocation,
} from "./reference/ledger"
import { createMutationProcessor, type ProcessorEvent } from "./server"

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
