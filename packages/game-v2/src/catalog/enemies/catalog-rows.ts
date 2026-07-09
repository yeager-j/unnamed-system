import {
  ENEMIES,
  getEnemyFamily,
  type EnemyFamily,
} from "@workspace/game-v2/catalog/enemies"
import type {
  Affinity,
  AffinityDamageType,
} from "@workspace/game-v2/kernel/vocab"

/**
 * One catalog enemy as the browse table renders it (UNN-346) — the lean
 * projection the master list needs (name, family, level, HP) plus the creature's
 * `weaknesses` for the at-a-glance row tags. Read off the authored enemy
 * {@link import("@workspace/game-v2/kernel").Entity} templates directly (no
 * resolve): the browse list wants the authored numbers, not derived ones. Pure
 * display shaping, kept here next to the catalog rather than inline in the list
 * component.
 */
export interface EnemyCatalogRow {
  key: string
  name: string
  family: EnemyFamily
  level: number
  maxHP: number
  /** Damage types this creature is Weak to — the red "exploit this" row tags. */
  weaknesses: AffinityDamageType[]
}

/** Filters applied to the catalog rows: a free-text name search and an optional
 *  family. An absent/`null` family means "all families". */
export interface EnemyCatalogFilter {
  search: string
  family: EnemyFamily | null
}

/** The damage types an enemy's sparse authored affinity chart marks as Weak. */
function weaknessesOf(
  affinities: Partial<Record<AffinityDamageType, Affinity>>
): AffinityDamageType[] {
  return (Object.entries(affinities) as [AffinityDamageType, Affinity][])
    .filter(([, affinity]) => affinity === "weak")
    .map(([damageType]) => damageType)
}

/**
 * Builds the full set of {@link EnemyCatalogRow}s from the hardcoded catalog,
 * one per enemy. A row's family always resolves (every key has one), so the
 * fallback is a defensive `"humanoid"` that can't be hit at runtime.
 */
export function buildEnemyCatalogRows(): EnemyCatalogRow[] {
  return ENEMIES.map((entity) => ({
    key: entity.id,
    name: entity.components.identity?.name ?? entity.id,
    family: getEnemyFamily(entity.id) ?? "humanoid",
    level: entity.components.level?.value ?? 0,
    maxHP: entity.components.vitals?.base ?? 0,
    weaknesses: weaknessesOf(entity.components.affinities?.base ?? {}),
  }))
}

/**
 * Filters rows by a case-insensitive name substring and an optional family.
 * Pure — the browse list re-runs it on every keystroke / chip toggle.
 */
export function filterEnemyCatalogRows(
  rows: EnemyCatalogRow[],
  { search, family }: EnemyCatalogFilter
): EnemyCatalogRow[] {
  const needle = search.trim().toLowerCase()
  return rows.filter((row) => {
    const matchesFamily = family === null || row.family === family
    const matchesSearch = row.name.toLowerCase().includes(needle)
    return matchesFamily && matchesSearch
  })
}

/** A level header and the rows at that level — the grouped shape the master list
 *  renders ("LEVEL n  ·  count"). */
export interface EnemyCatalogLevelGroup {
  level: number
  rows: EnemyCatalogRow[]
}

/**
 * Groups rows by `level` ascending, each group's rows sorted by name. Pure —
 * the master list's "sort by Level" view-model.
 */
export function groupEnemyRowsByLevel(
  rows: EnemyCatalogRow[]
): EnemyCatalogLevelGroup[] {
  const byLevel = new Map<number, EnemyCatalogRow[]>()
  for (const row of rows) {
    const group = byLevel.get(row.level) ?? []
    group.push(row)
    byLevel.set(row.level, group)
  }

  return [...byLevel.entries()]
    .sort(([a], [b]) => a - b)
    .map(([level, group]) => ({
      level,
      rows: group.sort((a, b) => a.name.localeCompare(b.name)),
    }))
}

/** Per-family counts across the full catalog, for the filter chips' badges
 *  (`Humanoid 6`, `Beast 1`, …). Keyed by family; absent ⇒ zero. */
export function enemyFamilyCounts(
  rows: EnemyCatalogRow[]
): Partial<Record<EnemyFamily, number>> {
  const counts: Partial<Record<EnemyFamily, number>> = {}
  for (const row of rows) {
    counts[row.family] = (counts[row.family] ?? 0) + 1
  }
  return counts
}
