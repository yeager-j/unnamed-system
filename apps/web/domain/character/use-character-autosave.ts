"use client"

import type { MutationErrorOf } from "@workspace/headcanon"
import type {
  MutationLifecycleError,
  MutationReceipt,
} from "@workspace/headcanon/react"
import { err, ok, type Result } from "@workspace/result"

import type { EntityWrite } from "@/domain/entity/commit/write.schema"
import {
  useDebouncedAutoSave,
  type UseDebouncedAutoSaveArgs,
  type UseDebouncedAutoSaveReturn,
} from "@/lib/sync/use-debounced-auto-save"

import type { IdentityWrite } from "./commit/identity.schema"
import { characterEntityWrite, characterIdentityWrite } from "./commit/protocol"
import { CharacterRoot } from "./use-character-root"

type CharacterAutoSaveDomainError =
  | MutationErrorOf<typeof characterEntityWrite>
  | MutationErrorOf<typeof characterIdentityWrite>

export type CharacterAutoSaveError =
  | CharacterAutoSaveDomainError
  | "save-interrupted"

type CharacterMutationResult<Error extends CharacterAutoSaveDomainError> =
  Result<MutationReceipt<Error>, Error>

function asRefusal<Error>(failure: MutationLifecycleError<Error>) {
  return failure.kind === "domain" || failure.kind === "replay-refused"
    ? failure
    : null
}

async function settleAutoSave<
  TValue,
  Error extends CharacterAutoSaveDomainError,
>(
  value: TValue,
  result: CharacterMutationResult<Error>
): Promise<Result<{ value: TValue }, CharacterAutoSaveError>> {
  if (!result.ok) return err(result.error)

  const accepted = await result.value.accepted
  if (accepted.ok) return ok({ value })

  const failure = accepted.error
  const refusal = asRefusal(failure)
  if (refusal) return err(refusal.error)
  if (failure.kind === "root-unmounted" && failure.outcome === "accepted") {
    return ok({ value })
  }
  return err("save-interrupted")
}

/** Debounced autosave for free-text fields stored through an entity descriptor. */
export function useCharacterEntityAutoSave(
  args: Omit<
    UseDebouncedAutoSaveArgs<string, CharacterAutoSaveError>,
    "save"
  > & {
    makeWrite: (value: string) => EntityWrite
  }
): UseDebouncedAutoSaveReturn<string> {
  const root = CharacterRoot.useRoot()
  const { makeWrite, ...rest } = args

  return useDebouncedAutoSave<string, CharacterAutoSaveError>({
    ...rest,
    save: (value) =>
      settleAutoSave(
        value,
        root.mutate(
          characterEntityWrite({
            entityId: root.value.profile.id,
            write: makeWrite(value),
          })
        )
      ),
  })
}

/** Debounced autosave for app-owned character profile fields. */
export function useCharacterProfileAutoSave<TValue>(
  args: Omit<
    UseDebouncedAutoSaveArgs<TValue, CharacterAutoSaveError>,
    "save"
  > & {
    makeWrite: (value: TValue) => IdentityWrite
  }
): UseDebouncedAutoSaveReturn<TValue> {
  const root = CharacterRoot.useRoot()
  const { makeWrite, ...rest } = args

  return useDebouncedAutoSave<TValue, CharacterAutoSaveError>({
    ...rest,
    save: (value) =>
      settleAutoSave(
        value,
        root.mutate(
          characterIdentityWrite({
            entityId: root.value.profile.id,
            write: makeWrite(value),
          })
        )
      ),
  })
}
