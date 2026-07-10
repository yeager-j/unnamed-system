import type { ArchetypeLineageGroup } from "@workspace/game-v2/archetypes/display"
import { renderFormula } from "@workspace/game-v2/combat/formula"
import type { Entity, ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"
import {
  canLevelUp,
  MAX_LEVEL,
  VICTORIES_PER_LEVEL,
} from "@workspace/game-v2/progression/leveling"
import { PRISMA_HEAL } from "@workspace/game-v2/resources/derive"
import { MAX_EXHAUSTION_LEVEL } from "@workspace/game-v2/resources/exhaustion.schema"

import type { CharacterProfile } from "@/lib/character/load"
import { archetypesByLineage } from "@/lib/game-engine-v2"

/**
 * The sheet's persistent **left rail** view model (UNN-557; design handoff
 * "The Left Rail") — one pure shaping pass from the loaded pair to exactly what
 * the rail renders, so the components stay layout-only. Sections are `null`
 * when their read-unit didn't resolve (a data-shy entity renders a shorter
 * rail, never a crash).
 */
export interface RailView {
  name: string
  pronouns: string | null
  portraitUrl: string | null
  level: number | null
  archetype: RailArchetype | null
  hp: RailPool | null
  sp: RailPool | null
  victories: RailVictories | null
  attributes: AttributeScores | null
  prisma: RailPrisma | null
  exhaustion: RailExhaustion | null
}

export interface RailPool {
  current: number
  max: number
}

/**
 * The archetype pill + its switch menu. Options are the engine's content-named
 * lineage groups (C8–C10) — the pill's popover groups by Lineage, then
 * Tier-and-name within one.
 */
export interface RailArchetype {
  activeKey: string | null
  activeName: string | null
  activeRank: number | null
  groups: ArchetypeLineageGroup[]
}

export interface RailVictories {
  banked: number
  threshold: number
  /** Victories still needed for the next level (0 when level-up is available). */
  toNext: number
  canLevelUp: boolean
  atMaxLevel: boolean
}

export interface RailPrisma {
  current: number
  max: number
  /** The heal-per-charge display string (e.g. `"2d8 + 4"`). */
  healFormula: string
}

export interface RailExhaustion {
  level: number
  max: number
  description: string
}

export function buildRailView(
  profile: Pick<CharacterProfile, "name" | "pronouns" | "portraitUrl">,
  entity: Entity,
  resolved: ResolvedEntity
): RailView {
  const { archetypes, vitals, skillPool, attributes, resources } =
    resolved.components
  // Level + Victories are authored state (no derivation), so they read off the
  // entity — the resolve fold emits no `level` read-unit.
  const level = entity.components.level

  return {
    name: profile.name,
    pronouns: profile.pronouns,
    portraitUrl: profile.portraitUrl,
    level: level?.value ?? null,
    archetype: archetypes
      ? railArchetype(archetypes, archetypesByLineage(resolved))
      : null,
    hp: vitals ? { current: vitals.currentHP, max: vitals.maxHP } : null,
    sp: skillPool
      ? { current: skillPool.currentSP, max: skillPool.maxSP }
      : null,
    victories: level
      ? {
          banked: level.victories,
          threshold: VICTORIES_PER_LEVEL,
          toNext: Math.max(0, VICTORIES_PER_LEVEL - level.victories),
          canLevelUp: canLevelUp(level),
          atMaxLevel: level.value >= MAX_LEVEL,
        }
      : null,
    attributes: attributes ?? null,
    prisma: resources
      ? {
          current: resources.currentPrisma,
          max: resources.maxPrisma,
          healFormula: renderFormula(PRISMA_HEAL),
        }
      : null,
    exhaustion: resolved.components.exhaustion
      ? {
          level: resolved.components.exhaustion.level,
          max: MAX_EXHAUSTION_LEVEL,
          description: resolved.components.exhaustion.description,
        }
      : null,
  }
}

function railArchetype(
  archetypes: NonNullable<ResolvedEntity["components"]["archetypes"]>,
  groups: ArchetypeLineageGroup[]
): RailArchetype {
  const active = groups
    .flatMap((group) => group.options)
    .find((option) => option.key === archetypes.active)

  return {
    activeKey: archetypes.active,
    activeName: active?.name ?? null,
    activeRank: active?.rank ?? null,
    groups,
  }
}
