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
import { getMechanic } from "@workspace/game-v2/mechanics"
import { err, ok, type Result } from "@workspace/game/foundation"

import {
  requireCampaignDM,
  requireOwnerOrCampaignDM,
} from "@/lib/auth/campaign-access"
import type { CombatantWrite } from "@/lib/combat/commit/write.schema"
import {
  applyCombatantWrite,
  type WriterDeps,
} from "@/lib/combat/commit/writers"
import type { EncounterRow } from "@/lib/db/schema/encounter"
import {
  applyDamageForCharacter,
  applyHealForCharacter,
  applyRecoverSPForCharacter,
  applySpendSPForCharacter,
  applyUsePrismaForCharacter,
} from "@/lib/db/writes/adjust-pools"
import { saveEncounterSession } from "@/lib/db/writes/encounter"
import { applyMechanicStateForCharacter } from "@/lib/db/writes/mechanic-state"
import { publishEncounterPing } from "@/lib/realtime/publish"

import { revalidateEncounter } from "../../encounter/revalidate"
import { revalidateCharacter } from "../../revalidate"
import type { ApplyCombatantWriteError } from "./apply-combatant-write.schema"

/**
 * The two **Stores** (UNN-520; ADR §2.9, amended CD19) — one per storage home,
 * behind one interface, so the action body past `storeFor` is branchless. The
 * interface is **descriptor-in** (`commit(write)`), not `commit(patch)`: the
 * patch composition survives client-side as the optimistic predictor
 * (`applyCombatantWrite`); server-side each home commits natively —
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
    write: CombatantWrite
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
  write: CombatantWrite
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
 * of silently no-oping in the reducer. Its deps are derived server-side —
 * currently `{}`: Prisma's resolved max is not yet derivable in v2 (the
 * upgrade tree is unshipped), so a session-arm `usePrisma` refuses with
 * `no-prisma-max` until the max ships. Never read from the wire.
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

      const deps: WriterDeps = {}
      const validated = applyCombatantWrite(
        participant.entity.components,
        write,
        deps
      )
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
 * The **durable** home: the participant is a reference to a character row, so
 * the write delegates per-component to the existing per-field wrappers — each
 * one loads, validates, merges, and bumps `vitalsVersion` itself
 * (`publishCharacterPing` fires inside the version guard). The v2↔v1 shape
 * translation is decided **once, here**: signed depletion ↔ absolute
 * `currentHP`/`currentSP` columns, the `Mechanics.states` record ↔ the active
 * Archetype's single `mechanicState` jsonb.
 *
 * **Interim semantic rule (one semantic per storage home):** until the v2
 * entity table lands (UNN-511/PR12), durable writes carry v1 semantics — v1's
 * clamps (no over-max HP), v1's active-mechanic constraint (`wrong-mechanic`
 * when the named mechanic isn't the active Archetype's), and **no `setMax`**
 * (a PC's max derives from the engine; `unsupported-durable-write`). The
 * sheet's own buttons and the console therefore agree on every PC row; the
 * divergence from the ephemeral arm's v2 semantics is deliberate and dies at
 * PR12.
 */
export function entityRowStore(context: {
  characterId: string
  expectedVersion: number
}): CombatantStore {
  return {
    auth: "owner-or-campaign-dm",
    async commit(write) {
      const character = await requireOwnerOrCampaignDM(context.characterId)

      const committed = await commitDurable(context, write)
      if (!committed.ok) return committed

      revalidateCharacter(character)
      return ok({
        version: committed.value.version,
        channel: { domain: "character", shortId: character.shortId },
      })
    },
  }
}

/** The per-component delegation to the v1 per-field wrappers. */
async function commitDurable(
  context: { characterId: string; expectedVersion: number },
  write: CombatantWrite
): Promise<Result<{ version: number }, ApplyCombatantWriteError>> {
  const { characterId, expectedVersion } = context

  switch (write.component) {
    case "vitals": {
      if (write.op === "setMax") return err("unsupported-durable-write")
      const apply =
        write.op === "damage" ? applyDamageForCharacter : applyHealForCharacter
      return apply(characterId, write.amount, expectedVersion)
    }
    case "skillPool": {
      if (write.op === "setMax") return err("unsupported-durable-write")
      const apply =
        write.op === "damage"
          ? applySpendSPForCharacter
          : applyRecoverSPForCharacter
      return apply(characterId, write.amount, expectedVersion)
    }
    case "resources":
      return applyUsePrismaForCharacter(characterId, expectedVersion)
    case "mechanics": {
      const transitions = getMechanic(write.mechanic)?.transitions
      if (transitions === undefined) return err("no-transitions")
      return applyMechanicStateForCharacter(
        characterId,
        write.mechanic,
        (state) => transitions.apply(state, write.transition),
        expectedVersion
      )
    }
  }
}
