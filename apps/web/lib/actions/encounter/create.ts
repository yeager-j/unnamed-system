"use server"

import {
  createCombatSession,
  ok,
  type Result,
} from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { createEncounter } from "@/lib/db/writes/encounter"

import {
  CreateEncounterSchema,
  type CreateEncounterError,
  type CreateEncounterInput,
} from "./create.schema"

/**
 * Creates a fresh `draft` encounter inside a campaign and returns its public
 * `shortId` so the client can redirect to the setup shell (`/combat/{shortId}`,
 * UNN-335) — mirroring how `startCharacterDraftAction` hands back a `shortId`
 * for the builder. The combatant roster starts empty
 * (`createCombatSession([])`); the four setup panels (UNN-298/299/300/301)
 * populate it and the explicit save (UNN-302) persists it.
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

  const { shortId } = await createEncounter({
    campaignId: parsed.data.campaignId,
    name: parsed.data.name,
    notes: parsed.data.notes ?? null,
    session: createCombatSession([]),
  })

  return ok({ shortId })
}
