import { forbidden } from "next/navigation"

import {
  createReduceSession,
  saveSession,
  type LoadedSession,
} from "@workspace/game-v2/encounter"
import {
  toMechanicTransitionEvent,
  toSessionEvent,
  toUseResourceEvent,
  type SessionEvent,
} from "@workspace/game-v2/encounter/session-event"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { createStampAccumulator } from "@workspace/headcanon"
import { MutationContentionError } from "@workspace/headcanon/drizzle"
import { finalizeExternalActionCommit } from "@workspace/headcanon/next/server"
import { err, ok, type Result } from "@workspace/result"

import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"
import { applyEntityWrite } from "@/domain/entity/commit/writers"
import { requireActor } from "@/lib/auth/actor"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import { saveEncounterSession } from "@/lib/db/writes/encounter"
import {
  publishCharacterPing,
  publishEncounterPing,
} from "@/lib/realtime/publish"

import { revalidateEncounter } from "../../encounter/revalidate"
import { isEntityWriteAuthRejection } from "../../entity/authorize-write"
import { commitEntityWrite } from "../../entity/entity-row-store"
import {
  entityInvalidationPublisher,
  reportInvalidationFailure,
} from "../../entity/mutations/invalidations"
import type { ApplyCombatantWriteError } from "./apply-combatant-write.schema"

/**
 * The two **Stores** (UNN-520; ADR §2.9, amended CD19) — one per storage home,
 * behind one interface, so the action body past `storeFor` is branchless. The
 * interface is **descriptor-in** (`commit(write)`), not `commit(patch)`: the
 * patch composition survives client-side as the optimistic predictor
 * (`applyEntityWrite`); server-side each home commits natively —
 *
 * - the **session arm** by reducer event (CD4: the reducer stays the single
 *   pure session writer — commit-by-event, never patch-merge), and
 * - the **durable arm** by the existing per-field wrappers, each of which
 *   reads-and-merges its own row (the UNN-226 lesson institutionalized).
 *
 * `auth` is each home's own gate, run as the first step of `commit` so the
 * two-step protocol cannot be mis-ordered; both gates trip `forbidden()`.
 */
export interface CombatantStore {
  /** Which gate this home runs — declarative, for tests and the CLAUDE.md. */
  auth: "campaign-dm" | "owner-or-campaign-dm"
  commit(
    write: CombatEntityWrite
  ): Promise<Result<CommittedWrite, ApplyCombatantWriteError>>
}

/** The bumped token + the realtime stream the write pinged. */
export interface CommittedWrite {
  version: number
  channel: { domain: "encounter" | "character"; shortId: string }
}

/** Server-side id mint for the session reducer (unused by these event kinds). */
const newId = () => crypto.randomUUID()

/**
 * Translates a validated descriptor into the router-only reducer event — the
 * deep-path constructors' one call site (the import fence + barrel omission
 * keep it that way). The single decision point from write vocabulary to event
 * vocabulary.
 */
function mintSessionEvent(
  participantId: ParticipantId,
  write: CombatEntityWrite
): SessionEvent {
  switch (write.component) {
    case "vitals":
    case "skillPool":
      return toSessionEvent({
        participantId,
        component: write.component,
        op: write.op,
        amount: write.amount,
      })
    case "resources":
      return toUseResourceEvent({ participantId, resource: "prisma" })
    case "mechanics":
      return toMechanicTransitionEvent({
        participantId,
        mechanic: write.mechanic,
        transition: write.transition,
      })
  }
}

/**
 * The **ephemeral** home: the participant lives in the session blob, so the
 * write flows Writer-validate → mint event → `reduceSession` → fail-closed
 * `saveSession` → guarded blob write, pinging the encounter channel.
 *
 * The Writer's `applyOp` runs first as the **validation pre-mint** (CD19): a
 * capability miss or an unaffordable Prisma use errs at the boundary instead
 * of silently no-oping in the reducer. Validation inputs are the stored
 * components plus engine constants (the base Prisma cap) — never the wire.
 */
export function sessionStore(context: {
  row: EncounterRow
  loaded: LoadedSession
  participantId: ParticipantId
  expectedVersion: number
}): CombatantStore {
  return {
    auth: "campaign-dm",
    async commit(write) {
      await requireCampaignDM(context.row.campaignId)

      const participant = context.loaded.session.participants.find(
        (entry) => entry.id === context.participantId
      )
      if (participant === undefined) return err("participant-not-found")

      const validated = applyEntityWrite(participant.entity.components, write)
      if (!validated.ok) return validated

      const event = mintSessionEvent(context.participantId, write)
      const next = createReduceSession(newId)(context.loaded.session, event)

      const stored = saveSession(next, context.loaded.locators)
      if (!stored.ok) return err("locator-missing")

      const saved = await saveEncounterSession(
        context.row.id,
        stored.value,
        context.expectedVersion
      )
      if (!saved.ok) return saved

      publishEncounterPing(context.row.shortId, {
        version: saved.value.version,
        status: context.row.status,
      })
      revalidateEncounter(context.row)
      return ok({
        version: saved.value.version,
        channel: { domain: "encounter", shortId: context.row.shortId },
      })
    },
  }
}

/**
 * The **durable** home is the encounter's **address adapter** (UNN-551): the
 * participant is a reference to an `entity` row, so this forwards to the shared
 * executor-neutral `commitEntityWrite` — the *same* `Writer ∘ entityRowStore`
 * composition the character surfaces use. It runs the Store standalone (`db`
 * executor) and owns the post-commit finalization the Store leaves to its caller:
 * the character-channel ping (relocated out of the version guard, UNN-674) and
 * this encounter's route revalidation. The only combat-specific thing is that the
 * address was an `entityId` resolved from a participant locator rather than passed
 * directly.
 *
 * Authorization (owner-or-campaign-DM for the `vitals` class these writes use)
 * runs inside the Store against the authenticated actor and returns a typed
 * refusal; this arm translates it to `forbidden()` to keep combat's 403 posture.
 * The Store reads the entity version server-side, so the durable arm no longer
 * consumes the wire's `expectedCharacterVersion` (kept required at the router for
 * wire compatibility); a lost race surfaces as `"stale"` for the console's
 * one-shot retry. Signed depletion is native, so over-max HP and `setMax` work.
 *
 * On success it revalidates **this encounter's** route (UNN-567) so the console's
 * optimistic base catches up on the transition response like the session arm's;
 * the ping still invalidates every other watcher of the character channel.
 */
export function entityRowStore(context: {
  row: EncounterRow
  entityId: string
}): CombatantStore {
  return {
    auth: "owner-or-campaign-dm",
    async commit(write) {
      const actor = await requireActor()
      const stamp = createStampAccumulator()

      let committed: Awaited<ReturnType<typeof commitEntityWrite>>
      try {
        committed = await commitEntityWrite(
          db,
          actor,
          { entityId: context.entityId, write },
          stamp
        )
      } catch (error) {
        if (error instanceof MutationContentionError) return err("stale")
        throw error
      }

      if (!committed.ok) {
        if (isEntityWriteAuthRejection(committed.error)) forbidden()
        return { ok: false, error: committed.error }
      }

      publishCharacterPing(committed.value.shortId, "entity", {
        [committed.value.versionClass]: committed.value.version,
      })
      // This arm advances a protocol axis outside the mutation executor, so it
      // must run the explicit external-commit finalization (Headcanon invariant
      // 15): expire the axis cache tag and publish the axis invalidation the
      // character route's predicted root now listens on (UNN-676). The legacy
      // ping above keeps the console's own un-migrated listeners fed; both
      // collapse into one protocol mutation when Phase 3a binds combat.
      await finalizeExternalActionCommit(
        stamp.accepted(),
        entityInvalidationPublisher,
        reportInvalidationFailure
      )
      revalidateEncounter(context.row)
      return ok({
        version: committed.value.version,
        channel: { domain: "character", shortId: committed.value.shortId },
      })
    },
  }
}
