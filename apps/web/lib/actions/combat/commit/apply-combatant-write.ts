"use server"

import type { StoredEntityLocator } from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import {
  loadEncounterForWrite,
  type LoadedEncounterForWrite,
} from "@/lib/db/queries/load-encounter-v2"

import {
  ApplyCombatantWriteSchema,
  type ApplyCombatantWriteError,
  type ApplyCombatantWriteInput,
} from "./apply-combatant-write.schema"
import {
  entityRowStore,
  sessionStore,
  type CombatantStore,
  type CommittedWrite,
} from "./stores"

/**
 * The **write-router Server Action** (UNN-520; ADR §2.9, CD18/CD19) — one
 * component write against one combatant, routed to its storage home. The home
 * is **derived from the locator's shape** (`storage: "durable"` vs `"inline"`)
 * read off the server's own out-of-band map; the client's belief is never
 * consulted, so a session-arm write against a durable participant is rejected
 * by construction. Past {@link storeFor} the body is branchless — parse,
 * resolve the store, commit (each store runs its own auth gate first).
 *
 * The generic wire (`apply-event.ts`) structurally cannot carry these writes
 * (the `ComponentWriteEvent` exclusion, CD19); this action is their only door.
 */
export async function applyCombatantWriteAction(
  input: ApplyCombatantWriteInput
): Promise<Result<CommittedWrite, ApplyCombatantWriteError>> {
  const parsed = ApplyCombatantWriteSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const loaded = await loadEncounterForWrite(parsed.data.encounterId)
  if (!loaded.ok) return loaded

  const locator = loaded.value.loaded.locators.get(parsed.data.participantId)
  if (locator === undefined) return err("participant-not-found")

  const store = storeFor(loaded.value, locator, parsed.data)
  if (!store.ok) return store

  return store.value.commit(parsed.data.write)
}

/**
 * The one decision point from locator shape to Store — durable participants
 * commit through their `entity` row (guarded on the wire's
 * `expectedCharacterVersion`, which carries the entity's `vitalsVersion`),
 * inline participants through the session blob (guarded on the encounter
 * `expectedVersion`). Each arm requires **its own** token and ignores the
 * other's (UNN-567): a client whose storage belief is wrong fails closed with
 * the arm's `missing-*-version` — it cannot mis-route.
 */
function storeFor(
  loaded: LoadedEncounterForWrite,
  locator: StoredEntityLocator,
  input: {
    participantId: ParticipantId
    expectedVersion?: number
    expectedCharacterVersion?: number
  }
): Result<CombatantStore, ApplyCombatantWriteError> {
  if (locator.storage === "durable") {
    if (input.expectedCharacterVersion === undefined) {
      return err("missing-character-version")
    }
    return ok(
      entityRowStore({
        row: loaded.row,
        entityId: locator.entityId,
        expectedVersion: input.expectedCharacterVersion,
      })
    )
  }
  if (input.expectedVersion === undefined) {
    return err("missing-encounter-version")
  }
  return ok(
    sessionStore({
      row: loaded.row,
      loaded: loaded.loaded,
      participantId: input.participantId,
      expectedVersion: input.expectedVersion,
    })
  )
}
