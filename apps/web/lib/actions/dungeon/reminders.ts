"use server"

import type { DungeonState } from "@workspace/game-v2/spatial"
import { err, ok, type Result } from "@workspace/game/foundation"

import { requireCampaignDM } from "@/lib/auth/campaign-access"
import { loadDungeonRowById } from "@/lib/db/queries/load-dungeon"
import { saveDungeonState } from "@/lib/db/writes/dungeon"
import { publishDungeonPing } from "@/lib/realtime/publish"

import {
  SetRandomEncounterIntervalSchema,
  SetRandomEncountersEnabledSchema,
  type ReminderSettingError,
  type SetRandomEncounterIntervalInput,
  type SetRandomEncountersEnabledInput,
} from "./reminders.schema"
import { revalidateDungeon } from "./revalidate"

/**
 * Toggles the random-encounter reminder on/off for a delve (PRD FR-4) — a
 * per-field write: the server reads the dungeon row and merges only
 * `reminderSettings.randomEncounters.enabled`, version-guarded (UNN-226 — never a
 * client-built full state). Pairs with {@link setRandomEncounterIntervalAction}.
 */
export async function setRandomEncountersEnabledAction(
  input: SetRandomEncountersEnabledInput
): Promise<Result<{ version: number }, ReminderSettingError>> {
  const parsed = SetRandomEncountersEnabledSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, enabled, expectedVersion } = parsed.data
  return mergeReminderSettings(dungeonId, expectedVersion, (state) => ({
    ...state,
    reminderSettings: {
      ...state.reminderSettings,
      randomEncounters: {
        ...state.reminderSettings.randomEncounters,
        enabled,
      },
    },
  }))
}

/**
 * Sets the random-encounter cadence (1 / 2 / 3 / 6 dungeon turns ≙ 10m / 20m / 30m
 * / 1h — PRD FR-4) — the per-field sibling of
 * {@link setRandomEncountersEnabledAction}, merging only
 * `reminderSettings.randomEncounters.intervalTurns` server-side.
 */
export async function setRandomEncounterIntervalAction(
  input: SetRandomEncounterIntervalInput
): Promise<Result<{ version: number }, ReminderSettingError>> {
  const parsed = SetRandomEncounterIntervalSchema.safeParse(input)
  if (!parsed.success) return err("invalid-input")

  const { dungeonId, intervalTurns, expectedVersion } = parsed.data
  return mergeReminderSettings(dungeonId, expectedVersion, (state) => ({
    ...state,
    reminderSettings: {
      ...state.reminderSettings,
      randomEncounters: {
        ...state.reminderSettings.randomEncounters,
        intervalTurns,
      },
    },
  }))
}

/** Shared body: gate, read the dungeon state, apply the single-field `merge`, and
 *  persist version-guarded (the per-field merge the UNN-226 pattern prescribes). */
async function mergeReminderSettings(
  dungeonId: string,
  expectedVersion: number,
  merge: (state: DungeonState) => DungeonState
): Promise<Result<{ version: number }, ReminderSettingError>> {
  const dungeon = await loadDungeonRowById(dungeonId)
  if (dungeon === null) return err("dungeon-not-found")
  await requireCampaignDM(dungeon.campaignId)

  const saved = await saveDungeonState(
    dungeonId,
    merge(dungeon.state),
    expectedVersion
  )
  if (!saved.ok) return saved

  publishDungeonPing(dungeon.shortId, {
    version: saved.value.version,
    status: dungeon.status,
  })
  revalidateDungeon(dungeon)
  return ok({ version: saved.value.version })
}
