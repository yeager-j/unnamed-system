import { err, ok, type Result } from "@workspace/result"

import type { StandardSchemaV1 } from "./standard-schema"

/**
 * `optimistic` — first local application at mutate time.
 * `rebase` — replay over a causally newer base (after an accepted snapshot or
 * a terminal rejection removed an earlier prediction).
 */
export interface MutationContext {
  readonly phase: "optimistic" | "rebase"
}

/**
 * A mutation definition owns the transport name, argument schema, and
 * deterministic local projection. Mutation names are the serialized protocol
 * vocabulary: they must be stable across compatible client and server
 * deployments. `apply` is a prediction, not authorization — it must be pure
 * (never mutate its input state) and deterministic, because the runtime
 * replays it over every newer base.
 */
export interface MutationDefinition<
  State,
  Name extends string,
  Args,
  ApplyError,
> {
  readonly name: Name
  readonly args: StandardSchemaV1<unknown, Args>
  apply(
    state: State,
    args: Args,
    context: MutationContext
  ): Result<State, ApplyError>
}

/** Typed mutation intent: a registered name plus validated, serializable args. */
export interface MutationInvocation<
  Name extends string = string,
  Args = unknown,
> {
  readonly name: Name
  readonly args: Args
}

/**
 * The value returned by `defineMutation`: a typed invocation factory that also
 * carries its definition for registry assembly.
 */
export interface MutationFactory<State, Name extends string, Args, ApplyError> {
  (args: Args): MutationInvocation<Name, Args>
  readonly definition: MutationDefinition<State, Name, Args, ApplyError>
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- variance sink for heterogeneous registry members
export type AnyMutationFactory = MutationFactory<any, string, any, any>

export type FactoryState<Factory> =
  Factory extends MutationFactory<
    infer State,
    infer _Name,
    infer _Args,
    infer _E
  >
    ? State
    : never

export type InvocationOf<Factory> =
  Factory extends MutationFactory<
    infer _State,
    infer Name,
    infer Args,
    infer _E
  >
    ? MutationInvocation<Name, Args>
    : never

export type ApplyErrorOf<Factory> =
  Factory extends MutationFactory<
    infer _State,
    infer _Name,
    infer _Args,
    infer ApplyError
  >
    ? ApplyError
    : never

export interface InvalidArgs {
  readonly kind: "invalid"
  readonly issues: ReadonlyArray<StandardSchemaV1.Issue>
}

export interface UnknownMutation {
  readonly kind: "unknown-mutation"
  readonly name: string
}

export type DecodeError = InvalidArgs | UnknownMutation

/**
 * The registry combines definitions for the runtime and provides the decoder
 * used by the authority to re-validate untrusted wire invocations.
 */
export interface MutationRegistry<
  State,
  Invocation extends MutationInvocation,
  ApplyError,
> {
  readonly names: ReadonlyArray<string>
  get(
    name: string
  ): MutationDefinition<State, string, unknown, ApplyError> | undefined
  decode(invocation: {
    readonly name: string
    readonly args: unknown
  }): Result<Invocation, DecodeError>
}

export function defineMutation<State, Name extends string, Args, ApplyError>(
  definition: MutationDefinition<State, Name, Args, ApplyError>
): MutationFactory<State, Name, Args, ApplyError> {
  const factory = (args: Args): MutationInvocation<Name, Args> => ({
    name: definition.name,
    args,
  })
  return Object.assign(factory, { definition })
}

export function defineMutations<
  const Factories extends ReadonlyArray<AnyMutationFactory>,
>(
  factories: Factories
): MutationRegistry<
  FactoryState<Factories[number]>,
  InvocationOf<Factories[number]>,
  ApplyErrorOf<Factories[number]>
> {
  type State = FactoryState<Factories[number]>
  type Invocation = InvocationOf<Factories[number]>
  type ApplyError = ApplyErrorOf<Factories[number]>

  const definitions = new Map<
    string,
    MutationDefinition<State, string, unknown, ApplyError>
  >()
  for (const factory of factories) {
    const definition = factory.definition as MutationDefinition<
      State,
      string,
      unknown,
      ApplyError
    >
    if (definitions.has(definition.name)) {
      throw new Error(`Duplicate mutation name "${definition.name}"`)
    }
    definitions.set(definition.name, definition)
  }

  return {
    names: [...definitions.keys()],
    get: (name) => definitions.get(name),
    decode: (invocation) => {
      const definition = definitions.get(invocation.name)
      if (!definition) {
        return err({ kind: "unknown-mutation", name: invocation.name })
      }
      const validated = validateArgs(definition.args, invocation.args)
      if (!validated.ok) return err(validated.error)
      return ok({
        name: invocation.name,
        args: validated.value,
      } as Invocation)
    },
  }
}

/**
 * Standard Schema permits async validation, but the replica projects the
 * first local mutation synchronously — an async schema cannot participate in
 * that contract, so it is rejected loudly rather than awaited.
 */
export function validateArgs<Args>(
  schema: StandardSchemaV1<unknown, Args>,
  input: unknown
): Result<Args, InvalidArgs> {
  const outcome = schema["~standard"].validate(input)
  if (outcome instanceof Promise) {
    throw new TypeError("Mutation argument schemas must validate synchronously")
  }
  if (outcome.issues) {
    return err({ kind: "invalid", issues: outcome.issues })
  }
  return ok(outcome.value)
}
