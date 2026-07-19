import { z } from "zod/v4"

import type { Entity } from "@workspace/game-v2/kernel/entity"
import {
  loadEntity,
  type ComponentLoadIssue,
} from "@workspace/game-v2/kernel/load-seam"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type {
  CombatAdvantage,
  CombatSide,
} from "@workspace/game-v2/kernel/vocab/combat"
import { err, ok, type Result } from "@workspace/result"

import type {
  StoredEntityLocator,
  StoredParticipant,
  StoredSession,
} from "./locator"
import { overlayComponentsSchema, type OverlayComponents } from "./overlay"

/**
 * The **storage-native session shell** (UNN-655) — the persisted contract
 * ({@link StoredSession}) refined once through the F6 validation seams, without
 * dissolving storage homes. Where {@link import("./load-session").loadSession}
 * hydrates durable references into full entities (and therefore needs an impure
 * {@link import("./load-session").DurableSource}), the shell keeps a durable
 * participant as a **reference** and parses only what the blob itself carries:
 * inline entities (via {@link loadEntity}) and overlays (via
 * {@link overlayComponentsSchema}).
 *
 * This is the value type a per-encounter-row replica root can serve atomically —
 * every fact in a shell is stored under the encounter row, so one row read yields
 * one consistent observation with no cross-row hydration. Engine logic never
 * consumes a shell (the F1 kill is untouched); a runtime `Session` view is
 * composed downstream by joining durable state from its own authority.
 *
 * Because a {@link ParticipantShell} carries its home, the serialize inverse is
 * **total**: {@link import("./load-session").saveSession}'s fail-closed
 * locator-miss arm is unrepresentable here — there is no out-of-band map to
 * fall out of sync with.
 */

/**
 * One shell participant's storage home: a durable *reference* (live components
 * sit on the entity row, owned by that row's authority) or an *inline* entity
 * parsed from the blob. The same 2-arm shape as {@link StoredEntityLocator},
 * with the inline arm refined `unknown → Entity`.
 */
export type ShellEntity =
  | { readonly storage: "durable"; readonly entityId: string }
  | { readonly storage: "inline"; readonly entity: Entity }

/**
 * One shell participant: the roster `id` (distinct from `entity.id` — one
 * durable entity may appear in two roster slots), its storage home, and its
 * parsed overlay.
 */
export interface ParticipantShell {
  readonly id: ParticipantId
  readonly entity: ShellEntity
  readonly overlay: OverlayComponents
}

/**
 * The refined session blob: scalars verbatim from {@link StoredSession},
 * participants as {@link ParticipantShell}s in stored order.
 */
export interface SessionShell {
  readonly round: number
  readonly currentActorId: ParticipantId | null
  readonly advantage: CombatAdvantage | null
  readonly firstSide: CombatSide | null
  readonly mapInstanceId?: string
  readonly participants: readonly ParticipantShell[]
}

/**
 * One participant's shell-load failure — {@link
 * import("./load-session").ParticipantLoadIssue} minus the `missing-durable`
 * arm, which cannot occur without hydration.
 */
export type ShellLoadIssue =
  | {
      participantId: ParticipantId
      kind: "invalid-entity"
      issues: ComponentLoadIssue[]
    }
  | {
      participantId: ParticipantId
      kind: "invalid-overlay"
      issues: readonly z.core.$ZodIssue[]
    }

/**
 * Refines one stored participant: an inline entity parses through the same
 * {@link loadEntity} seam the hydrating loader uses; a durable reference passes
 * through untouched. Entity-before-overlay failure order matches the loader so
 * each failing participant surfaces one issue.
 */
function loadParticipantShell(
  stored: StoredParticipant
): Result<ParticipantShell, ShellLoadIssue> {
  let entity: ShellEntity
  if (stored.locator.storage === "durable") {
    entity = { storage: "durable", entityId: stored.locator.entityId }
  } else {
    const parsed = loadEntity(
      stored.locator.entity.id,
      stored.locator.entity.components
    )
    if (!parsed.ok) {
      return err({
        participantId: stored.id,
        kind: "invalid-entity",
        issues: parsed.error,
      })
    }
    entity = { storage: "inline", entity: parsed.value }
  }

  const overlay = overlayComponentsSchema.safeParse(stored.overlay)
  if (!overlay.success) {
    return err({
      participantId: stored.id,
      kind: "invalid-overlay",
      issues: overlay.error.issues,
    })
  }

  return ok({ id: stored.id, entity, overlay: overlay.data })
}

/**
 * Refines a persisted {@link StoredSession} into a {@link SessionShell} — pure,
 * hydration-free. All participants must refine for the shell to project: any
 * failure returns **every** participant's issue so the shell's consumer can
 * report them together (the loader's aggregation contract).
 */
export function loadSessionShell(
  stored: StoredSession
): Result<SessionShell, ShellLoadIssue[]> {
  const participants: ParticipantShell[] = []
  const issues: ShellLoadIssue[] = []

  for (const entry of stored.participants) {
    const loaded = loadParticipantShell(entry)
    if (loaded.ok) participants.push(loaded.value)
    else issues.push(loaded.error)
  }

  if (issues.length > 0) return err(issues)

  return ok({
    round: stored.round,
    currentActorId: stored.currentActorId,
    advantage: stored.advantage,
    firstSide: stored.firstSide,
    ...(stored.mapInstanceId !== undefined && {
      mapInstanceId: stored.mapInstanceId,
    }),
    participants,
  })
}

/**
 * The write-back inverse of {@link loadSessionShell} — **total**, unlike
 * {@link import("./load-session").saveSession}: each participant shell carries
 * its own home, so there is no locator map to miss. Durable participants
 * persist as references; inline participants persist their live entity.
 */
export function serializeSessionShell(shell: SessionShell): StoredSession {
  return {
    round: shell.round,
    currentActorId: shell.currentActorId,
    advantage: shell.advantage,
    firstSide: shell.firstSide,
    ...(shell.mapInstanceId !== undefined && {
      mapInstanceId: shell.mapInstanceId,
    }),
    participants: shell.participants.map((participant) => ({
      id: participant.id,
      locator:
        participant.entity.storage === "durable"
          ? { storage: "durable", entityId: participant.entity.entityId }
          : {
              storage: "inline",
              entity: {
                id: participant.entity.entity.id,
                components: participant.entity.entity.components,
              },
            },
      overlay: participant.overlay,
    })),
  }
}
