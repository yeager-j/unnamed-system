"use server"

import { comintMapInstance, saveSession } from "@workspace/game-v2/encounter"
import { ok, type Result } from "@workspace/game-v2/kernel/result"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { db } from "@/lib/db/client"
import { createEncounter } from "@/lib/db/writes/encounter"
import { insertMapInstance } from "@/lib/db/writes/map-instance"
import { createSession } from "@/lib/game-engine-v2"

import {
  CreateEncounterSchema,
  type CreateEncounterError,
  type CreateEncounterInput,
} from "./create.schema"

/**
 * Creates a fresh `draft` encounter inside a campaign and returns its public
 * `shortId` so the client can redirect to the setup shell (`/combat/{shortId}`,
 * UNN-335) — mirroring how `startCharacterDraftAction` hands back a `shortId`
 * for the builder. The roster starts empty: a v2 {@link createSession} mint
 * serialized through the fail-closed `saveSession` (an empty roster needs an
 * empty locator map, so the serialize always succeeds), paired with the
 * {@link comintMapInstance} birth co-mint over no placements (UNN-535 hard
 * cutover). The setup panels populate it through the v2 combat wire.
 *
 * Create touches **two** rows in one transaction (UNN-459): the empty Instance
 * (the spatial truth, `mapInstanceId` is non-null) and the encounter
 * referencing it. Both inserts share the transaction executor — and the
 * `shortId`-collision retry re-runs the whole closure in a fresh transaction —
 * so a partial create can't strand an Instance or an encounter.
 *
 * Auth is `requireCampaignDM` — only the campaign's DM may create encounters in
 * it; a non-DM trips `forbidden()` (HTTP 403) before any write. No `revalidate`
 * is needed: the new encounter is reached by the returned redirect, not a list
 * the caller is already viewing.
 */
export async function createEncounterAction(
  input: CreateEncounterInput
): Promise<Result<{ shortId: string }, CreateEncounterError>> {
  const parsed = CreateEncounterSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: "invalid-input" }

  await requireCampaignDM(parsed.data.campaignId)

  const session = createSession([], () => crypto.randomUUID())
  const stored = saveSession(session, new Map())
  if (!stored.ok) {
    throw new Error("empty-roster mint failed the fail-closed serialize")
  }

  const mapInstanceId = crypto.randomUUID()
  const { shortId } = await db.transaction(async (tx) => {
    await insertMapInstance(tx, mapInstanceId, comintMapInstance(session, {}))
    return createEncounter(
      {
        campaignId: parsed.data.campaignId,
        name: parsed.data.name,
        notes: parsed.data.notes ?? null,
        session: stored.value,
        mapInstanceId,
      },
      tx
    )
  })

  return ok({ shortId })
}
