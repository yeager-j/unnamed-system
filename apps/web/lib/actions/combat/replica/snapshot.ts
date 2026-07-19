"use server"

import { and, eq } from "drizzle-orm"

import {
  loadSessionShell,
  storedSessionSchema,
} from "@workspace/game-v2/encounter"
import type { Accepted } from "@workspace/replica"
import { err, ok, type Result } from "@workspace/result"

import {
  pickCombatComponents,
  type CombatDurableState,
  type EncounterReplicaState,
} from "@/domain/combat/replica/mutations"
import type { EntityVersionVector } from "@/domain/entity/replica/cursor"
import { loadEntityRow } from "@/domain/game-v2/entity-row-to-bag"
import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { loadEncounterEnvelopeById } from "@/lib/db/queries/load-encounter"
import { encounters } from "@/lib/db/schema/encounter"
import { encounterReplicaClient } from "@/lib/db/schema/encounter-replica-client"
import { entity } from "@/lib/db/schema/entity"
import { replicaClient } from "@/lib/db/schema/replica-client"

import {
  CombatAcceptedRequestSchema,
  type CombatAcceptedRequest,
} from "./wire.schema"

export type EncounterAccepted = Accepted<EncounterReplicaState, number>
export type CombatDurableAccepted = Accepted<
  CombatDurableState,
  EntityVersionVector
>

export interface CombatAccepted {
  /** Present iff the request carried an encounter identity. */
  readonly encounter?: EncounterAccepted
  /** Keyed by entity id — the durable root's authority address. A requested
   *  entity absent from this map was not a durable participant of the
   *  encounter (or vanished): nothing is served for it, and the console's
   *  roster diff decides what to do — the batch never fails for one straggler. */
  readonly durable: Readonly<Record<string, CombatDurableAccepted>>
}

export type CombatAcceptedError =
  | "invalid-input"
  | "encounter-not-found"
  | "encounter-not-live"
  | "invalid-session"

/**
 * The combat replica's batched bootstrap door (UNN-646), the sibling of
 * `loadEntityAcceptedAction` — a read-only action (parse → gate → read, no
 * revalidate, per-viewer so never cached) that REGISTERS every requested
 * identity and returns each root's personalized accepted tuple.
 *
 * Batched deliberately: Server Actions execute serially per tab, so one
 * action registers the encounter identity plus N durable identities in one
 * round-trip at console mount. Per root the atomic-observation rule holds —
 * each root's `{value, through, cursor}` comes from ONE joined statement
 * (encounter ⨝ its ledger; entity ⨝ its ledger). Cross-root atomicity is
 * deliberately NOT claimed: the roots are separate replicas with separate
 * cursors, and each rebases independently.
 *
 * **The gate is campaign-DM via the encounter** — the combat console is the
 * DM's surface. The encounter tuple is the STORAGE-NATIVE root (UNN-655):
 * status plus the session shell — every fact atomically stored under the
 * encounter row, durable participants as references only, NEVER hydrated
 * components (the atomicity invariant: an encounter watermark/version can
 * never be paired with separately read entity state). Inline entities carry
 * their full component bags — DM-authored facts of the DM's own row, behind
 * the DM gate. The durable VALUE stays the redacted combat root: exactly the
 * four combat-writable components (`pickCombatComponents`), never narrative
 * or app columns — the redacted-root answer to the entity snapshot door's
 * strict-owner reservation. A requested entity is REGISTERED and served only
 * when it is a durable participant of THIS encounter (locator-verified), so
 * the door can neither read arbitrary entities the DM doesn't run nor mint
 * ledger rows for them — registration is the license the push door's
 * absent-row ⇒ `unknown-client` invariant leans on.
 */
export async function loadCombatAcceptedAction(
  input: CombatAcceptedRequest
): Promise<Result<CombatAccepted, CombatAcceptedError>> {
  const parsed = CombatAcceptedRequestSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")
  const { encounterId, encounter: encounterIdentity, durable } = parsed.data

  const envelope = await loadEncounterEnvelopeById(encounterId)
  if (!envelope) return err("encounter-not-found")
  await requireCampaignDM(envelope.campaignId)
  // Liveness before any identity is minted or refreshed (UNN-646 review).
  // Registration is the license the push doors' absent-row ⇒ `unknown-client`
  // invariant leans on, so minting one for an ended encounter would hand a
  // stale tab a write channel the push doors then have to refuse one delivery
  // at a time. The binding turns this into a terminal `unavailable` bootstrap.
  if (envelope.status !== "live") return err("encounter-not-live")

  // Encounter bootstrap registration (same invariant as the entity door: a
  // client identity exists at a push door only if it passed through here
  // first, so an absent ledger row there means swept-or-never-bootstrapped,
  // never new). The encounter root IS the row, so the DM gate above is its
  // whole license; durable registration waits below until the roster has
  // licensed each entity (Codex P2, PR #390).
  if (encounterIdentity) {
    await db
      .insert(encounterReplicaClient)
      .values({ ...encounterIdentity, encounterId, lastMutationId: 0 })
      .onConflictDoUpdate({
        target: [
          encounterReplicaClient.clientGroupId,
          encounterReplicaClient.clientId,
        ],
        set: { updatedAt: new Date() },
      })
  }

  // The encounter root's atomic tuple: encounter row + this client's
  // watermark from one statement, then a PURE parse + shell refinement in
  // memory — no durable hydration. Without an encounter identity the
  // sentinel matches no ledger row (real ids are non-empty) and the same
  // statement serves the durable-roster verification.
  const identity = encounterIdentity ?? { clientGroupId: "", clientId: "" }
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

  const storedParsed = storedSessionSchema.safeParse(joined.encounter.session)
  if (!storedParsed.success) return err("invalid-session")
  const shell = loadSessionShell(storedParsed.data)
  if (!shell.ok) return err("invalid-session")

  const encounterAccepted: EncounterAccepted | undefined = encounterIdentity
    ? {
        value: {
          status: joined.encounter.status,
          session: shell.value,
        },
        through: joined.lastMutationId ?? 0,
        cursor: joined.encounter.version,
      }
    : undefined

  // The encounter's durable roster — the membership check that scopes which
  // entities this door will REGISTER or serve. Registration is the license
  // the push door's absent-row ⇒ unknown-client invariant leans on, so an
  // identity for an entity outside this roster must never reach the ledger
  // (Codex P2, PR #390): a request for one is simply not admitted — no row,
  // no value, and the batch never fails for the straggler.
  const rosterEntityIds = new Set(
    shell.value.participants.flatMap((participant) =>
      participant.entity.storage === "durable"
        ? [participant.entity.entityId]
        : []
    )
  )
  const admitted = durable.filter((request) =>
    rosterEntityIds.has(request.entityId)
  )

  if (admitted.length > 0) {
    await db
      .insert(replicaClient)
      .values(
        admitted.map((request) => ({
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

  const durableAccepted: Record<string, CombatDurableAccepted> = {}
  for (const request of admitted) {
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

  return ok({ encounter: encounterAccepted, durable: durableAccepted })
}
