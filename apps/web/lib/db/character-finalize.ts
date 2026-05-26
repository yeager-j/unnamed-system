import { and, eq, sql } from "drizzle-orm"

import { getArchetype } from "../game/archetypes"
import { type WeaponKey } from "../game/items"
import { startingWeaponForLineage } from "../game/lineage-starting-weapon"
import { err, ok, type Result } from "../game/result"
import { buildStatComputationCharacter } from "../game/stat-character"
import {
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
} from "../game/stats"
import { db } from "./index"
import {
  characterExists,
  type CharacterArchetypeRow,
  type CharacterRow,
} from "./load-character"
import { characters, inventoryItems } from "./schema/character"

/**
 * Persistence for the Movement 4 Finalize button (UNN-218). Flips a `draft`
 * row to `finalized` in a single transaction, alongside the side-effects
 * PRD §5.1 calls out for the commit moment:
 *
 * - **Status flip.** `status = 'finalized'`.
 * - **Pool seeding.** `currentHP` / `currentSP` set to the path-and-Origin
 *   derived max so the freshly-created character starts at full HP/SP. The
 *   draft row is seeded with zeros by `startCharacterDraft`, which is
 *   meaningless once the character is real.
 * - **Dice seeding.** `hitDiceRemaining` / `skillDiceRemaining` set to the
 *   level-1 max so Respite is immediately usable.
 * - **Starting weapon.** Inserts a new `inventoryItem` for the Origin
 *   Lineage's canonical weapon, equipped. The catalog lookup
 *   ({@link startingWeaponForLineage}) returns `null` for Lineages whose
 *   starting weapon hasn't shipped yet — those finalize attempts surface
 *   `"no-starting-weapon-for-lineage"` so the UI can guide the player.
 *
 * Talents granted by the Origin Archetype are *not* seeded onto
 * `gainedTalents` — `resolveTalents` derives the active Archetype's Talents
 * at hydration, so seeding them would double-count once an Archetype switch
 * lands post-MVP.
 *
 * Conditioned on `(id, identityVersion)` so a concurrent identity-class
 * write surfaces `"stale"` rather than silently overwriting (UNN-140). All
 * mutations live inside a `db.transaction` so a failure on the inventory
 * insert never leaves a half-finalized row.
 */

export type CharacterFinalizePersistenceError =
  | "character-not-found"
  | "stale"
  | "no-origin-archetype"
  | "no-starting-weapon-for-lineage"

export interface CharacterFinalizePersistenceSuccess {
  shortId: string
  startingWeaponKey: WeaponKey
}

export async function finalizeCharacter(
  characterRow: CharacterRow,
  archetypeRows: readonly CharacterArchetypeRow[],
  expectedVersion: number
): Promise<
  Result<CharacterFinalizePersistenceSuccess, CharacterFinalizePersistenceError>
> {
  const activeRow = resolveActiveArchetypeRow(characterRow, archetypeRows)
  if (!activeRow) return err("no-origin-archetype")

  const archetype = getArchetype(activeRow.archetypeKey)
  if (!archetype) return err("no-origin-archetype")

  const startingWeaponKey = startingWeaponForLineage(archetype.lineage)
  if (!startingWeaponKey) return err("no-starting-weapon-for-lineage")

  const stats = buildStatComputationCharacter(
    {
      pathChoice: characterRow.pathChoice,
      level: characterRow.level,
      manualBonuses: characterRow.manualBonuses,
      activeCharacterArchetypeId: characterRow.activeArchetypeId,
    },
    archetypeRows.map((row) => ({
      id: row.id,
      archetypeKey: row.archetypeKey,
      rank: row.rank,
      inheritanceSlots: row.inheritanceSlots,
      mechanicState: row.mechanicState,
    })),
    []
  )

  const maxHP = computeMaxHP(stats)
  const maxSP = computeMaxSP(stats)
  const maxHitDice = computeMaxHitDice(characterRow.level)
  const maxSkillDice = computeMaxSkillDice(characterRow.level)

  return db.transaction(async (tx) => {
    const [bumped] = await tx
      .update(characters)
      .set({
        status: "finalized",
        currentHP: maxHP,
        currentSP: maxSP,
        hitDiceRemaining: maxHitDice,
        skillDiceRemaining: maxSkillDice,
        identityVersion: sql`${characters.identityVersion} + 1`,
        updatedAt: new Date(),
      })
      .where(
        and(
          eq(characters.id, characterRow.id),
          eq(characters.identityVersion, expectedVersion)
        )
      )
      .returning({ identityVersion: characters.identityVersion })

    if (!bumped) {
      return (await characterExists(characterRow.id))
        ? err("stale")
        : err("character-not-found")
    }

    await tx.insert(inventoryItems).values({
      characterId: characterRow.id,
      catalogItemKey: startingWeaponKey,
      equipped: true,
    })

    return ok({ shortId: characterRow.shortId, startingWeaponKey })
  })
}

function resolveActiveArchetypeRow(
  characterRow: CharacterRow,
  archetypeRows: readonly CharacterArchetypeRow[]
): CharacterArchetypeRow | null {
  const activeId = characterRow.activeArchetypeId
  if (!activeId) return null
  return archetypeRows.find((row) => row.id === activeId) ?? null
}
