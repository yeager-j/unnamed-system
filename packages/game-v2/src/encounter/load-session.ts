import { z } from "zod/v4"

import type { Entity } from "@workspace/game-v2/kernel/entity"
import {
  loadEntity,
  type ComponentLoadIssue,
} from "@workspace/game-v2/kernel/load-seam"
import { err, ok, type Result } from "@workspace/game-v2/kernel/result"

import {
  type StoredEntity,
  type StoredEntityLocator,
  type StoredParticipant,
  type StoredSession,
} from "./locator"
import { overlayComponentsSchema } from "./overlay"
import type { Participant, Session } from "./session"

/**
 * The **one loader boundary** (ADR §2.1; CD3/CD14 — the F1 kill). `loadSession`
 * dissolves each persisted participant's storage home into a uniform
 * `Participant.entity`, after which **nothing downstream** (resolve, reducer,
 * redaction, initiative, fallen, party-composition) ever names a home. The
 * durable-vs-inline fact is kept **out-of-band** in a parallel
 * `Map<participantId, StoredEntityLocator>` (write-back + the R1.5 inverse), never
 * copied onto the pure {@link Participant}.
 *
 * The loader **never reads the catalog** (CD3/CD8 amended): a catalog enemy was
 * materialized into a plain inline entity at session mint, so by load time both
 * arms are pure storage — `durable → fetch row + loadEntity`, `inline → loadEntity`.
 * `loadEntity` is the single F6 validation seam for **both** arms, so a durable row
 * and an inline blob are validated identically; a durable participant's `vitals`
 * arrive from the row, so `currentHP` re-derives at resolve.
 */

/**
 * The injected impure reader for a durable participant's row — supplied by the app
 * shell (a DB fetch), returning the raw {@link StoredEntity} (id + jsonb) so the
 * loader validates it through the same {@link loadEntity} seam as an inline blob.
 * `undefined` for a dangling reference (a missing/deleted row).
 */
export type DurableSource = (entityId: string) => StoredEntity | undefined

/**
 * The loader's output: the pure runtime {@link Session} plus the **out-of-band**
 * locator map. The map is keyed by **participant/roster id** (the combatant key,
 * not `entity.id` — a durable entity could appear twice), and feeds the write-back
 * saver ({@link saveSession}) and the `toParticipantSetup` inverse (R1.5).
 */
export interface LoadedSession {
  session: Session
  locators: Map<string, StoredEntityLocator>
}

/** One participant's load failure — the three honest modes, no faked issues. */
export type ParticipantLoadIssue =
  | { participantId: string; kind: "missing-durable"; entityId: string }
  | {
      participantId: string
      kind: "invalid-entity"
      issues: ComponentLoadIssue[]
    }
  | {
      participantId: string
      kind: "invalid-overlay"
      issues: readonly z.core.$ZodIssue[]
    }

/**
 * Dissolves one stored participant into a runtime {@link Participant} (storage home
 * resolved away) — `durable → loadDurable + loadEntity`, `inline → loadEntity` —
 * with its overlay blob validated via {@link overlayComponentsSchema}. Returns the
 * built participant on success, or the **first** failure encountered (entity before
 * overlay) so each failing participant surfaces one issue.
 */
function loadParticipant(
  loadDurable: DurableSource,
  stored: StoredParticipant
): Result<Participant, ParticipantLoadIssue> {
  let source: StoredEntity
  if (stored.locator.storage === "durable") {
    const row = loadDurable(stored.locator.entityId)
    if (!row) {
      return err({
        participantId: stored.id,
        kind: "missing-durable",
        entityId: stored.locator.entityId,
      })
    }
    source = row
  } else {
    source = stored.locator.entity
  }

  const entity: Result<Entity, ComponentLoadIssue[]> = loadEntity(
    source.id,
    source.components
  )
  if (!entity.ok) {
    return err({
      participantId: stored.id,
      kind: "invalid-entity",
      issues: entity.error,
    })
  }

  const overlay = overlayComponentsSchema.safeParse(stored.overlay)
  if (!overlay.success) {
    return err({
      participantId: stored.id,
      kind: "invalid-overlay",
      issues: overlay.error.issues,
    })
  }

  return ok({ id: stored.id, entity: entity.value, overlay: overlay.data })
}

/**
 * Loads a persisted {@link StoredSession} into a runtime {@link LoadedSession}.
 * Curried deps-first over the injected durable-row reader (mirrors the rest of the
 * engine). All participants must load for the session to project: any failure
 * returns **every** participant's issue so the shell can report them together.
 */
export function loadSession(loadDurable: DurableSource) {
  return (
    stored: StoredSession
  ): Result<LoadedSession, ParticipantLoadIssue[]> => {
    const participants: Participant[] = []
    const locators = new Map<string, StoredEntityLocator>()
    const issues: ParticipantLoadIssue[] = []

    for (const entry of stored.participants) {
      const loaded = loadParticipant(loadDurable, entry)
      if (loaded.ok) {
        participants.push(loaded.value)
        locators.set(entry.id, entry.locator)
      } else {
        issues.push(loaded.error)
      }
    }

    if (issues.length > 0) return err(issues)

    return ok({
      session: {
        round: stored.round,
        currentActorId: stored.currentActorId,
        advantage: stored.advantage,
        firstSide: stored.firstSide,
        ...(stored.mapInstanceId !== undefined && {
          mapInstanceId: stored.mapInstanceId,
        }),
        participants,
      },
      locators,
    })
  }
}

/**
 * Projects one runtime participant back to its persisted {@link StoredEntityLocator}
 * for the **session blob** write-back. A durable participant is written as a
 * **reference only** (`{ storage:"durable", entityId }`) — its live components stay
 * on the entity row, written via their own path/version token (§2.8b), never
 * embedded here. An inline participant is written with its **live** entity state
 * (post-reducer `vitals.damage` and friends).
 *
 * **Invariant (a UNN-520 write-router/shell obligation):** every *durable*
 * participant — including a future durable mid-combat joiner (R6.2) — MUST have its
 * locator registered in the out-of-band map **before** {@link saveSession} runs.
 * A locator-map miss falls through to the inline default, which serializes the
 * participant's components into the blob (home loss): the engine cannot recover the
 * durable home (F1), so inline is the only **self-contained** default a pure saver
 * can choose. The map — not this function — is what distinguishes the two homes.
 */
function storedLocatorFor(
  participant: Participant,
  locator: StoredEntityLocator | undefined
): StoredEntityLocator {
  if (locator?.storage === "durable") {
    return { storage: "durable", entityId: locator.entityId }
  }
  return {
    storage: "inline",
    entity: {
      id: participant.entity.id,
      components: participant.entity.components,
    },
  }
}

/**
 * The write-back inverse of {@link loadSession} (§2.8a — the DM is the sole blob
 * writer). Projects the pure {@link Session} + out-of-band locators back to a
 * {@link StoredSession}, reading each participant's storage home from the locator
 * map. Durable participants persist as references; inline participants persist their
 * live entity. Round-tripping a session with no reducer run reproduces the original
 * locators exactly.
 */
export function saveSession(
  session: Session,
  locators: Map<string, StoredEntityLocator>
): StoredSession {
  return {
    round: session.round,
    currentActorId: session.currentActorId,
    advantage: session.advantage,
    firstSide: session.firstSide,
    ...(session.mapInstanceId !== undefined && {
      mapInstanceId: session.mapInstanceId,
    }),
    participants: session.participants.map(
      (participant): StoredParticipant => ({
        id: participant.id,
        locator: storedLocatorFor(participant, locators.get(participant.id)),
        overlay: participant.overlay,
      })
    ),
  }
}
