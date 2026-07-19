import {
  createReduceSession,
  saveSession,
  type LoadedSession,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { err, ok, type Result } from "@workspace/result"

import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"
import { applyEntityWrite } from "@/domain/entity/commit/writers"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import { saveEncounterSession } from "@/lib/db/writes/encounter"
import { publishEncounterPing } from "@/lib/realtime/publish"

import { revalidateEncounter } from "../../encounter/revalidate"
import { commitEntityWrite } from "../../entity/entity-row-store"
import type { ApplyCombatantWriteError } from "./apply-combatant-write.schema"
import { mintSessionEvent } from "./mint-session-event"

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
 * native `commitEntityWrite` — the *same* `Writer ∘ entityRowStore` composition
 * the character surfaces use. It owns nothing the character door doesn't: auth
 * (owner-or-campaign-DM, inside `commitEntityWrite`), the pure Writer, the guarded
 * component-column write, and the realtime ping (in the version guard). The only
 * combat-specific thing here is that the address was an `entityId` resolved from a
 * participant locator rather than passed directly.
 *
 * Signed depletion is native now, so over-max HP works and `setMax` is a real
 * write — the v1 interim semantics (absolute columns, `unsupported-durable-write`)
 * are gone with the per-field wrappers this used to delegate to.
 *
 * On success it also revalidates **this encounter's** route (UNN-567):
 * `commitEntityWrite` pings only the character channel, so without the
 * revalidation the console's optimistic frame dropped on settle and briefly
 * showed the stale base until the pc-ping's refresh landed. With it, the RSC
 * payload rides the transition response exactly like the session arm's.
 */
export function entityRowStore(context: {
  row: EncounterRow
  entityId: string
  expectedVersion: number
}): CombatantStore {
  return {
    auth: "owner-or-campaign-dm",
    async commit(write) {
      const committed = await commitEntityWrite(
        context.entityId,
        write,
        context.expectedVersion
      )
      if (!committed.ok) return committed

      revalidateEncounter(context.row)
      return ok({
        version: committed.value.version,
        channel: { domain: "character", shortId: committed.value.shortId },
      })
    },
  }
}
