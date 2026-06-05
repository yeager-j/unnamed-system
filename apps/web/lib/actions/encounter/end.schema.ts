import type { z } from "zod/v4"

import type { EncounterWriteError } from "@/lib/db/writes/encounter"

import { encounterMutationBase } from "./encounter-mutation.schema"

/**
 * Input schema for {@link endEncounterAction} (UNN-320): just the shared
 * {@link encounterMutationBase} envelope (encounter id + optimistic-concurrency
 * token). Ending changes no session state — it is a single guarded `status` flip
 * — so there is no payload to add.
 */
export const EndEncounterSchema = encounterMutationBase

export type EndEncounterInput = z.input<typeof EndEncounterSchema>

/** Ending only ever fails on a bad payload or the shared guarded-write errors
 *  (`stale` / `encounter-not-found`) — all covered by `encounterErrorMessage`. */
export type EndEncounterError = "invalid-input" | EncounterWriteError
