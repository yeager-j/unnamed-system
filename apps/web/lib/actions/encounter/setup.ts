"use server"

import { err, type Result } from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { loadEncounterRowById } from "@/lib/db/queries/load-encounter"
import { saveEncounterSession } from "@/lib/db/writes/encounter"
import { createCombatSession } from "@/lib/game-engine"

import { revalidateEncounter } from "./revalidate"
import {
  SaveEncounterSetupSchema,
  type SaveEncounterSetupError,
  type SaveEncounterSetupInput,
} from "./setup.schema"

/**
 * Persists a draft encounter's assembled setup roster (UNN-302). The setup
 * panels (import PCs / sides / …) build an in-progress `CombatantSetup[]` in the
 * client with no DB write per interaction; this action saves the whole roster on
 * explicit "Save draft", version-guarded on the encounter's single `version`.
 *
 * Flow mirrors `applyCombatEvent`: parse → load the encounter → authorize against
 * the owning campaign (`requireCampaignDM` trips `forbidden()` for a non-DM) →
 * build the canonical `CombatSession` server-side from the (validated) setup
 * roster → save guarded on `expectedVersion`. The encounter stays `draft`; the
 * `draft → live` flip is the separate `startCombat` event (UNN-303/332).
 *
 * The roster carries each combatant's own stable `id` (UNN-301), so ids — and the
 * `engagement.targetCombatantIds` / `zoneId` placements that reference them —
 * survive every save. The **zone graph** is authored through `ZoneGraphEvent`s on
 * a separate path (`applyCombatEvent`), so rebuilding the session from the roster
 * alone would wipe it; we carry the persisted `zones`/`adjacency` forward
 * untouched. Placement completeness is **not** enforced here (the catalog
 * enemy-add path saves unplaced enemies, UNN-346); the setup shell gates Save /
 * Start on placement as a UX affordance.
 */
export async function saveEncounterSetupAction(
  input: SaveEncounterSetupInput
): Promise<Result<{ version: number }, SaveEncounterSetupError>> {
  const parsed = SaveEncounterSetupSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { encounterId, expectedVersion, combatants } = parsed.data

  const encounter = await loadEncounterRowById(encounterId)
  if (encounter === null) return err("encounter-not-found")
  await requireCampaignDM(encounter.campaignId)

  const base = createCombatSession(combatants)
  const session = {
    ...base,
    zones: encounter.session.zones,
    adjacency: encounter.session.adjacency,
  }

  const saved = await saveEncounterSession(
    encounterId,
    session,
    expectedVersion
  )
  if (!saved.ok) return saved

  revalidateEncounter(encounter)

  return saved
}
