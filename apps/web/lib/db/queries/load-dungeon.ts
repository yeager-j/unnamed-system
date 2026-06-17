import { eq } from "drizzle-orm"

import { dungeonStateSchema } from "@workspace/game/foundation"

import { db } from "@/lib/db/client"
import { dungeons, type DungeonRow } from "@/lib/db/schema/dungeon"

/**
 * Reads for the `dungeon` table — the exploration-time layer over a Map Instance
 * (Dungeon Map ADR). Like the encounter loader there is no game-engine *hydrate*
 * step: the `state` jsonb already is the full delve state. It is run through
 * {@link withParsedState} on read so the column's compile-time `$type` cast can't
 * hand a caller a blob that predates a schema field — the same defensive parse the
 * encounter (`session`) and Map Instance (`state`) loaders apply.
 */
function withParsedState(row: DungeonRow): DungeonRow {
  return { ...row, state: dungeonStateSchema.parse(row.state) }
}

/** The `dungeon` row by public `shortId` (state parsed), or `null` when none
 *  matches — the lookup the DM console (`getDungeonForDM`) resolves. */
export async function loadDungeonRowByShortId(
  shortId: string
): Promise<DungeonRow | null> {
  const [row] = await db
    .select()
    .from(dungeons)
    .where(eq(dungeons.shortId, shortId))
    .limit(1)

  return row ? withParsedState(row) : null
}

/**
 * The dungeon's `campaignId` only, or `null` when no dungeon matches. Lets a
 * write action authorize the caller against the owning campaign
 * (`requireCampaignDM`) *before* loading the `state` blob — the resolver every
 * dungeon/Instance write composes with the gate (parallels
 * `loadEncounterCampaignId`). Selects one column, so the read is index-light.
 */
export async function loadDungeonCampaignId(
  dungeonId: string
): Promise<string | null> {
  const [row] = await db
    .select({ campaignId: dungeons.campaignId })
    .from(dungeons)
    .where(eq(dungeons.id, dungeonId))
    .limit(1)

  return row?.campaignId ?? null
}

/**
 * The dungeon's current optimistic `version` only (by public `shortId`), or
 * `null` when no dungeon matches — stale-retry parity with encounters
 * (`loadEncounterVersionByShortId`): when a guarded write returns `"stale"`, the
 * queued-write hook refetches the fresh token here and retries once. Selects one
 * column, so the read is index-light.
 */
export async function loadDungeonVersionByShortId(
  shortId: string
): Promise<number | null> {
  const [row] = await db
    .select({ version: dungeons.version })
    .from(dungeons)
    .where(eq(dungeons.shortId, shortId))
    .limit(1)

  return row?.version ?? null
}
