"use server"

import {
  createReduceSession,
  saveSession,
  type Session,
} from "@workspace/game-v2/encounter"
import { asParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { err, ok, type Result } from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { loadEncounterCampaignId } from "@/lib/db/queries/load-encounter"
import { loadEncounterForWrite } from "@/lib/db/queries/load-encounter-v2"
import { saveEncounterSession } from "@/lib/db/writes/encounter"
import { instantiateEnemy } from "@/lib/game-engine-v2"
import { publishEncounterPing } from "@/lib/realtime/publish"

import { revalidateEncounter } from "../encounter/revalidate"
import {
  AddCatalogEnemiesSchema,
  type AddCatalogEnemiesError,
  type AddCatalogEnemiesInput,
} from "./add-participants.schema"

/**
 * Appends a staged queue of catalog enemies to an encounter's roster (UNN-535)
 * — the v2 twin of v1's `addSetupCombatantsAction`, backing the bestiary
 * browser's commit (UNN-346). Each queued key materializes `count` fresh inline
 * entities through the engine's {@link instantiateEnemy} (deep-copied, full-HP
 * — the same semantics the mint's catalog arm applies), registers each inline
 * locator, and folds one `addParticipant` per copy through the same pure
 * reducer the generic wire uses.
 *
 * Adds land **unplaced** (no occupancy token, add-then-place), so only the
 * session row is written — one guarded save for the whole batch, then the
 * encounter ping. An unknown wire-supplied key rejects the batch with
 * `unknown-enemy` before anything persists.
 */
export async function addCatalogEnemiesAction(
  input: AddCatalogEnemiesInput
): Promise<Result<{ version: number }, AddCatalogEnemiesError>> {
  const parsed = AddCatalogEnemiesSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { encounterId, expectedVersion, enemies } = parsed.data

  const campaignId = await loadEncounterCampaignId(encounterId)
  if (campaignId === null) return err("encounter-not-found")
  await requireCampaignDM(campaignId)

  const loaded = await loadEncounterForWrite(encounterId)
  if (!loaded.ok) return loaded
  const { row, loaded: loadedSession } = loaded.value

  const reduceSession = createReduceSession(newId)
  let session: Session = loadedSession.session
  for (const { enemyKey, count } of enemies) {
    for (let copy = 0; copy < count; copy++) {
      const participantId = asParticipantId(newId())
      const entity = instantiateEnemy(enemyKey, participantId)
      if (entity === undefined) return err("unknown-enemy")
      loadedSession.locators.set(participantId, {
        storage: "inline",
        entity: { id: entity.id, components: entity.components },
      })
      session = reduceSession(session, {
        kind: "addParticipant",
        setup: { id: participantId, side: "enemies", entity },
      })
    }
  }

  const stored = saveSession(session, loadedSession.locators)
  if (!stored.ok) return err("locator-missing")

  const saved = await saveEncounterSession(
    row.id,
    stored.value,
    expectedVersion
  )
  if (!saved.ok) return saved

  publishEncounterPing(row.shortId, {
    version: saved.value.version,
    status: row.status,
  })
  revalidateEncounter(row)
  return ok({ version: saved.value.version })
}

/** Server-side id mint — one fresh id per materialized enemy copy. */
const newId = () => crypto.randomUUID()
