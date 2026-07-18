type MutationError =
  | { type: "app"; message: string }
  | { type: "zero"; message: string }

export type MutationResult =
  | { type: "success" }
  | { type: "error"; error: MutationError }

export interface MutationHandle {
  client: Promise<MutationResult>
  server: Promise<MutationResult>
}

export interface MockZeroTransaction<State> {
  readonly clientID: string
  readonly location: "client" | "server"
  readonly mutationID: number
  readonly reason: "optimistic" | "rebase" | "authoritative"
  read(): State
  write(state: State): void
}

interface Parser<Args> {
  parse(input: unknown): Args
}

const definitionKind = Symbol("mock-zero-mutator-definition")
const mutatorKind = Symbol("mock-zero-mutator")

interface RuntimeDefinition<State> {
  readonly kind: typeof definitionKind
  parse(input: unknown): unknown
  run(input: { tx: MockZeroTransaction<State>; args: unknown }): Promise<void>
}

export interface MutatorDefinition<
  State,
  Args,
> extends RuntimeDefinition<State> {
  readonly __args?: Args
}

export interface MutatorInvocation<State> {
  readonly args: unknown
  readonly definition: RuntimeDefinition<State>
  readonly mutatorName: string
}

export interface Mutator<State, Args> {
  (args: Args): MutatorInvocation<State>
  readonly kind: typeof mutatorKind
  readonly mutatorName: string
  readonly definition: RuntimeDefinition<State>
}

type DefinitionTree<State> = {
  readonly [name: string]: RuntimeDefinition<State> | DefinitionTree<State>
}

type MutatorTree<Definitions> = {
  readonly [Name in keyof Definitions]: Definitions[Name] extends MutatorDefinition<
    infer State,
    infer Args
  >
    ? Mutator<State, Args>
    : Definitions[Name] extends DefinitionTree<infer _State>
      ? MutatorTree<Definitions[Name]>
      : never
}

interface MutationEnvelope<State> extends MutatorInvocation<State> {
  readonly clientID: string
  readonly id: number
}

interface PendingMutation<State> {
  readonly envelope: MutationEnvelope<State>
  readonly resolveServer: (result: MutationResult) => void
  processed: boolean
}

interface MockZeroClient<State> {
  mutate(invocation: MutatorInvocation<State>): MutationHandle
  read(): State
}

export interface MockZeroHarness<State> {
  readonly zero: MockZeroClient<State>
  commitExternal(invocation: MutatorInvocation<State>): Promise<MutationResult>
  pendingEnvelopes(): ReadonlyArray<{
    clientID: string
    id: number
    name: string
    args: unknown
  }>
  processNext(): Promise<MutationResult | undefined>
  publish(): Promise<void>
  redeliver(mutationID: number): Promise<MutationResult>
  readServer(): State
}

const success: MutationResult = { type: "success" }

/**
 * A disposable model of Zero's mutation semantics for UNN-638. It deliberately
 * omits queries, persistence, networking, and React integration. The useful
 * contract under test is smaller: named mutators, client-generated ordered
 * mutation IDs, separate client/server completion, transactional deduplication,
 * and rebase by replaying pending mutators over a newly published base. The
 * harness models one client group, so that wire-level scope stays implicit.
 */
export function createMockMutatorRegistry<State>() {
  function defineMutator<Args>(
    parser: Parser<Args>,
    run: (input: {
      tx: MockZeroTransaction<State>
      args: Args
    }) => Promise<void>
  ): MutatorDefinition<State, Args> {
    return {
      kind: definitionKind,
      parse: (input) => parser.parse(input),
      run: ({ tx, args }) => run({ tx, args: args as Args }),
    }
  }

  function defineMutators<const Definitions extends DefinitionTree<State>>(
    definitions: Definitions
  ): MutatorTree<Definitions> {
    return registerTree(definitions) as MutatorTree<Definitions>
  }

  return { defineMutator, defineMutators }
}

export function createMockZeroHarness<State>({
  clientID,
  initialState,
  mutators,
}: {
  clientID: string
  initialState: State
  mutators: Record<string, unknown>
}): MockZeroHarness<State> {
  let baseState = structuredClone(initialState)
  let optimisticState = structuredClone(initialState)
  let serverState = structuredClone(initialState)
  let nextMutationID = 1
  let lastServerMutationID = 0
  let clientChain = Promise.resolve()
  const pending: Array<PendingMutation<State>> = []

  function mutate(invocation: MutatorInvocation<State>): MutationHandle {
    const envelope: MutationEnvelope<State> = {
      ...invocation,
      clientID,
      id: nextMutationID++,
    }
    let resolveServer!: (result: MutationResult) => void
    const server = new Promise<MutationResult>((resolve) => {
      resolveServer = resolve
    })
    const client = clientChain
      .then(() =>
        applyMutation(optimisticState, envelope, "client", "optimistic")
      )
      .then((state) => {
        optimisticState = state
        pending.push({ envelope, processed: false, resolveServer })
        return success
      })
      .catch((error: unknown) => {
        const result = appError(error)
        resolveServer(result)
        return result
      })
    clientChain = client.then(() => undefined)

    return { client, server }
  }

  async function process(
    envelope: MutationEnvelope<State>
  ): Promise<MutationResult> {
    const expected = lastServerMutationID + 1
    if (envelope.id < expected) return success
    if (envelope.id > expected) {
      return zeroError(
        `Client ${envelope.clientID} sent mutation ${envelope.id}; expected ${expected}`
      )
    }

    const definition = findMutator<State>(
      mutators,
      envelope.mutatorName
    ).definition
    const result = await applyMutation(
      serverState,
      { ...envelope, args: definition.parse(envelope.args), definition },
      "server",
      "authoritative"
    )
      .then((state) => {
        serverState = state
        return success
      })
      .catch(appError)

    lastServerMutationID = envelope.id
    return result
  }

  return {
    zero: { mutate, read: () => structuredClone(optimisticState) },
    async commitExternal(invocation) {
      const definition = findMutator<State>(
        mutators,
        invocation.mutatorName
      ).definition
      const envelope: MutationEnvelope<State> = {
        ...invocation,
        args: definition.parse(invocation.args),
        definition,
        clientID: "external",
        id: 0,
      }
      try {
        serverState = await applyMutation(
          serverState,
          envelope,
          "server",
          "authoritative"
        )
        return success
      } catch (error) {
        return appError(error)
      }
    },
    pendingEnvelopes: () =>
      pending.map(({ envelope }) => ({
        clientID: envelope.clientID,
        id: envelope.id,
        name: envelope.mutatorName,
        args: envelope.args,
      })),
    async processNext() {
      const next = pending.find((mutation) => !mutation.processed)
      if (!next) return undefined
      const result = await process(next.envelope)
      next.processed = true
      next.resolveServer(result)
      return result
    },
    async publish() {
      baseState = structuredClone(serverState)
      const stillPending = pending.filter(
        ({ envelope }) => envelope.id > lastServerMutationID
      )
      optimisticState = structuredClone(baseState)
      for (const { envelope } of stillPending) {
        optimisticState = await applyMutation(
          optimisticState,
          envelope,
          "client",
          "rebase"
        )
      }
      pending.splice(0, pending.length, ...stillPending)
    },
    async redeliver(mutationID) {
      const delivered = pending.find(
        ({ envelope }) => envelope.id === mutationID
      )
      if (!delivered) {
        throw new Error(`Unknown mutation ${mutationID}`)
      }
      return process(delivered.envelope)
    },
    readServer: () => structuredClone(serverState),
  }
}

function registerTree<State>(
  definitions: DefinitionTree<State>,
  namespace: ReadonlyArray<string> = []
): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(definitions).map(([name, value]) => {
      const path = [...namespace, name]
      if (isRuntimeDefinition(value)) {
        const mutator = ((input: unknown) => ({
          args: value.parse(input),
          definition: value,
          mutatorName: path.join("."),
        })) as Mutator<State, unknown>
        Object.assign(mutator, {
          kind: mutatorKind,
          mutatorName: path.join("."),
          definition: value,
        })
        return [name, mutator]
      }
      return [name, registerTree(value, path)]
    })
  )
}

function isRuntimeDefinition<State>(
  value: RuntimeDefinition<State> | DefinitionTree<State>
): value is RuntimeDefinition<State> {
  return (
    "kind" in value &&
    value.kind === definitionKind &&
    "parse" in value &&
    typeof value.parse === "function" &&
    "run" in value &&
    typeof value.run === "function"
  )
}

function findMutator<State>(
  registry: Record<string, unknown>,
  mutatorName: string
): Mutator<State, unknown> {
  let current: unknown = registry
  for (const part of mutatorName.split(".")) {
    if (typeof current !== "object" || current === null || !(part in current)) {
      throw new Error(`Unknown mutator ${mutatorName}`)
    }
    current = (current as Record<string, unknown>)[part]
  }
  if (
    typeof current !== "function" ||
    !("kind" in current) ||
    current.kind !== mutatorKind
  ) {
    throw new Error(`Unknown mutator ${mutatorName}`)
  }
  return current as Mutator<State, unknown>
}

async function applyMutation<State>(
  state: State,
  envelope: MutationEnvelope<State>,
  location: MockZeroTransaction<State>["location"],
  reason: MockZeroTransaction<State>["reason"]
): Promise<State> {
  let next = structuredClone(state)
  const tx: MockZeroTransaction<State> = {
    clientID: envelope.clientID,
    location,
    mutationID: envelope.id,
    reason,
    read: () => structuredClone(next),
    write: (state) => {
      next = structuredClone(state)
    },
  }
  await envelope.definition.run({ tx, args: envelope.args })
  return next
}

function appError(error: unknown): MutationResult {
  return {
    type: "error",
    error: {
      type: "app",
      message: error instanceof Error ? error.message : String(error),
    },
  }
}

function zeroError(message: string): MutationResult {
  return { type: "error", error: { type: "zero", message } }
}
