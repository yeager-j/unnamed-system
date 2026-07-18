import { err, ok } from "@workspace/result"

import {
  defineMutation,
  defineMutations,
  type InvocationOf,
  type MutationRegistry,
} from "../mutations"
import { parseCount, parseRecord, parseString, schemaOf } from "./schema"

/**
 * The deliberately alien reference domain: collection-valued state (a list of
 * entries) rather than one entity. Used by the package's own contract tests
 * and by the polling reference binding. `vetoed` never originates from
 * `apply`; it is the terminal error test authorities reject with.
 */
export interface Ledger {
  readonly entries: ReadonlyArray<string>
}

export type LedgerError =
  | { readonly kind: "absent" }
  | { readonly kind: "conflict" }
  | { readonly kind: "vetoed" }

export const addEntry = defineMutation({
  name: "ledger.add",
  args: schemaOf((input) => {
    const record = parseRecord(input)
    return { entry: parseString(record.entry, "entry") }
  }),
  apply(state: Ledger, args) {
    return ok<Ledger>({ entries: [...state.entries, args.entry] })
  },
})

export const dropEntry = defineMutation({
  name: "ledger.drop",
  args: schemaOf((input) => {
    const record = parseRecord(input)
    return { entry: parseString(record.entry, "entry") }
  }),
  apply(state: Ledger, args) {
    if (!state.entries.includes(args.entry)) {
      return err<LedgerError>({ kind: "absent" })
    }
    return ok<Ledger>({
      entries: state.entries.filter((entry) => entry !== args.entry),
    })
  },
})

/**
 * A preconditioned command: the observed entry count is part of its meaning,
 * so replay over a base someone else extended surfaces a typed conflict
 * instead of silently applying old intent to a new semantic state.
 */
export const reserveIfCount = defineMutation({
  name: "ledger.reserve-if-count",
  args: schemaOf((input) => {
    const record = parseRecord(input)
    return {
      expectedCount: parseCount(record.expectedCount, "expectedCount"),
      entry: parseString(record.entry, "entry"),
    }
  }),
  apply(state: Ledger, args) {
    if (state.entries.length !== args.expectedCount) {
      return err<LedgerError>({ kind: "conflict" })
    }
    return ok<Ledger>({ entries: [...state.entries, args.entry] })
  },
})

export type LedgerInvocation =
  | InvocationOf<typeof addEntry>
  | InvocationOf<typeof dropEntry>
  | InvocationOf<typeof reserveIfCount>

export const ledgerMutations: MutationRegistry<
  Ledger,
  LedgerInvocation,
  LedgerError
> = defineMutations([addEntry, dropEntry, reserveIfCount])

export const LEDGER_INITIAL: Ledger = { entries: [] }
