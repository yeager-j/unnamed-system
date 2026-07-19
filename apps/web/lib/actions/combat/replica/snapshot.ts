"use server"

import { and, eq } from "drizzle-orm"

import type { Accepted } from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

import {
  pickCombatComponents,
  type CombatDurableState,
  type CombatInlineState,
} from "@/domain/combat/replica/mutations"
import type { EntityVersionVector } from "@/domain/entity/replica/cursor"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { loadEncounterEnvelopeById } from "@/lib/db/queries/load-encounter"
import { dissolveEncounterRow } from "@/lib/db/queries/load-encounter-session"
import { encounters } from "@/lib/db/schema/encounter"
import { encounterReplicaClient } from "@/lib/db/schema/encounter-replica-client"
import { entity } from "@/lib/db/schema/entity"
import { replicaClient } from "@/lib/db/schema/replica-client"

import {
  CombatAcceptedRequestSchema,
  type CombatAcceptedRequest,
} from "./wire.schema"

export type CombatInlineAccepted = Accepted<CombatInlineState, number>
export type CombatDurableAccepted = Accepted<
  CombatDurableState,
  EntityVersionVector
>

export interface CombatAccepted {
  /** Present iff the request carried an inline identity. */
  readonly inline?: CombatInlineAccepted
  /** Keyed by entity id — the durable root's authority address. A requested
   *  entity absent from this map was not a durable participant of the
   *  encounter (or vanished): nothing is served for it, and the console's
   *  roster diff decides what to do — the batch never fails for one straggler. */
  readonly durable: Readonly<Record<string, CombatDurableAccepted>>
}

export type CombatAcceptedError =
  | "invalid-input"
  | "encounter-not-found"
  | "invalid-session"

/**
 * The combat replica's batched bootstrap door (UNN-646), the sibling of
 * `loadEntityAcceptedAction` — a read-only action (parse → gate → read, no
 * revalidate, per-viewer so never cached) that REGISTERS every requested
 * identity and returns each root's personalized accepted tuple.
 *
 * Batched deliberately: Server Actions execute serially per tab, so one
 * action registers the inline identity plus N durable identities in one
 * round-trip at console mount. Per root the atomic-observation rule holds —
 * each root's `{value, through, cursor}` comes from ONE joined statement
 * (encounter ⨝ its ledger; entity ⨝ its ledger). Cross-root atomicity is
 * deliberately NOT claimed: the roots are separate replicas with separate
 * cursors, and each rebases independently.
 *
 * **The gate is campaign-DM via the encounter** — the combat console is the
 * DM's surface. The durable VALUE served here is the combat root: exactly
 * the four combat-writable components (`pickCombatComponents`), never
 * narrative or app columns — the redacted-root answer to the entity snapshot
 * door's strict-owner reservation (its doc: "the DM's in-play writes ride
 * the combat binding, whose root is scoped to state the DM may hold").
 * A requested entity is served only when it is a durable participant of THIS
 * encounter (locator-verified), so the door cannot be used to read arbitrary
 * entities the DM doesn't run.
 */
export async function loadCombatAcceptedAction(
  input: CombatAcceptedRequest
): Promise<Result<CombatAccepted, CombatAcceptedError>> {
  const parsed = CombatAcceptedRequestSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")
  const { encounterId, inline, durable } = parsed.data

  const envelope = await loadEncounterEnvelopeById(encounterId)
  if (!envelope) return err("encounter-not-found")
  await requireCampaignDM(envelope.campaignId)

  // Bootstrap registration (same invariant as the entity door: a client
  // identity exists at a push door only if it passed through here first, so
  // an absent ledger row there means swept-or-never-bootstrapped, never new).
  if (inline) {
    await db
      .insert(encounterReplicaClient)
      .values({ ...inline, encounterId, lastMutationId: 0 })
      .onConflictDoUpdate({
        target: [
          encounterReplicaClient.clientGroupId,
          encounterReplicaClient.clientId,
        ],
        set: { updatedAt: new Date() },
      })
  }
  if (durable.length > 0) {
    await db
      .insert(replicaClient)
      .values(
        durable.map((request) => ({
          ...request.identity,
          entityId: request.entityId,
          lastMutationId: 0,
        }))
      )
      .onConflictDoUpdate({
        target: [replicaClient.clientGroupId, replicaClient.clientId],
        set: { updatedAt: new Date() },
      })
  }

  // The inline root's atomic tuple: encounter row + this client's watermark
  // from one statement, then parse + dissolve in memory. Without an inline
  // identity the sentinel matches no ledger row (real ids are non-empty) and
  // the same statement serves the durable-roster verification.
  const identity = inline ?? { clientGroupId: "", clientId: "" }
  const [joined] = await db
    .select({
      encounter: encounters,
      lastMutationId: encounterReplicaClient.lastMutationId,
    })
    .from(encounters)
    .leftJoin(
      encounterReplicaClient,
      and(
        eq(encounterReplicaClient.encounterId, encounters.id),
        eq(encounterReplicaClient.clientGroupId, identity.clientGroupId),
        eq(encounterReplicaClient.clientId, identity.clientId)
      )
    )
    .where(eq(encounters.id, encounterId))
  if (!joined) return err("encounter-not-found")

  const dissolved = await dissolveEncounterRow(joined.encounter)
  if (!dissolved.ok) return err("invalid-session")
  const { loaded } = dissolved.value

  const inlineAccepted: CombatInlineAccepted | undefined = inline
    ? {
        value: {
          participants: Object.fromEntries(
            loaded.session.participants.flatMap((participant) => {
              const locator = loaded.locators.get(participant.id)
              if (locator?.storage !== "inline") return []
              return [
                [
                  participant.id,
                  pickCombatComponents(participant.entity.components),
                ],
              ]
            })
          ),
        },
        through: joined.lastMutationId ?? 0,
        cursor: joined.encounter.version,
      }
    : undefined

  // The encounter's durable roster — the membership check that scopes which
  // entities this door will serve.
  const rosterEntityIds = new Set(
    [...loaded.locators.values()].flatMap((locator) =>
      locator.storage === "durable" ? [locator.entityId] : []
    )
  )

  const durableAccepted: Record<string, CombatDurableAccepted> = {}
  for (const request of durable) {
    if (!rosterEntityIds.has(request.entityId)) continue
    const [row] = await db
      .select({ entity, lastMutationId: replicaClient.lastMutationId })
      .from(entity)
      .leftJoin(
        replicaClient,
        and(
          eq(replicaClient.entityId, entity.id),
          eq(replicaClient.clientGroupId, request.identity.clientGroupId),
          eq(replicaClient.clientId, request.identity.clientId)
        )
      )
      .where(eq(entity.id, request.entityId))
    if (!row) continue
    const loadedEntity = loadEntityRow(row.entity)
    if (!loadedEntity.ok) continue
    durableAccepted[request.entityId] = {
      value: {
        components: pickCombatComponents(loadedEntity.value.components),
      },
      through: row.lastMutationId ?? 0,
      cursor: {
        identity: row.entity.identityVersion,
        vitals: row.entity.vitalsVersion,
        inventory: row.entity.inventoryVersion,
        progression: row.entity.progressionVersion,
      },
    }
  }

  return ok({ inline: inlineAccepted, durable: durableAccepted })
}
