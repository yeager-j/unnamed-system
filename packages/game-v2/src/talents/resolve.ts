import type { ResolvedEntity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import { getTalent } from "@workspace/game-v2/talents/catalog"
import { TALENT_KEYS, type TalentKey } from "@workspace/game-v2/talents/vocab"

/**
 * The Talent resolution family, ported from v1 (`engine/character/talents/{utils,
 * display}.ts`) and re-homed onto the component model. A character's Talents are
 * **derived, not stored** (rulebook 2.1): the union of those the **active Archetype**
 * grants and those the character **owns** (background + downtime, authored on the
 * `talents` component). Talent display names come from the domain-local
 * {@link getTalent} catalog; only the active-Archetype lookup is injected via the
 * `GameData` port.
 */

const labelFor = (key: string): string => getTalent(key)?.name ?? key

const archetypeTalents = (
  archetypeKey: string | null,
  deps: Pick<GameData, "getArchetype">
): string[] =>
  archetypeKey ? (deps.getArchetype(archetypeKey)?.talents ?? []) : []

/**
 * The character's full Talent roster — the union of owned and active-Archetype
 * Talents, deduplicated (a Talent's +3 applies once regardless of source) and
 * sorted alphabetically by display name so consumers render it as-is.
 */
export function resolveTalents(
  ownedKeys: string[],
  activeArchetypeKey: string | null,
  deps: Pick<GameData, "getArchetype">
): string[] {
  const inherited = archetypeTalents(activeArchetypeKey, deps)
  return [...new Set([...ownedKeys, ...inherited])].sort((a, b) =>
    labelFor(a).localeCompare(labelFor(b))
  )
}

export interface TalentChip {
  key: string
  label: string
  inherited: boolean
}

export interface ResolvedSheetTalents {
  /** Inherited Talents (alpha) followed by owned Talents (alpha) — render order. */
  chips: TalentChip[]
  /** Canonical Talents the character doesn't have yet (alpha) — feeds the Add popover. */
  remaining: { key: TalentKey; label: string }[]
}

/**
 * Shapes the Talents block on the sheet's Explore tab (S2b). A character's Talents
 * split into two groups the tab renders differently: those granted by the **active
 * Archetype** (locked, not removable) and those the character **owns** via background
 * or downtime (removable). Inherited chips sort ahead of owned chips, each block
 * alphabetical by label; `remaining` is every canonical Talent neither source grants,
 * so the Add popover only offers picks the character can actually learn. Reads the
 * owned Talents + active Archetype off the `ResolvedEntity` (the archetypes/display
 * precedent) — the sheet already renders the resolved entity.
 */
export function resolveTalentsForSheet(deps: Pick<GameData, "getArchetype">) {
  return (entity: ResolvedEntity): ResolvedSheetTalents => {
    const owned = (entity.components.talents ?? []).map((talent) => talent.key)
    const inherited = archetypeTalents(
      entity.components.archetypes?.active ?? null,
      deps
    )
    const byLabel = (a: string, b: string): number =>
      labelFor(a).localeCompare(labelFor(b))
    const chips: TalentChip[] = [
      ...[...inherited].sort(byLabel).map((key) => ({
        key,
        label: labelFor(key),
        inherited: true,
      })),
      ...[...owned].sort(byLabel).map((key) => ({
        key,
        label: labelFor(key),
        inherited: false,
      })),
    ]

    const known = new Set<string>([...inherited, ...owned])
    const remaining = TALENT_KEYS.filter((key) => !known.has(key))
      .sort(byLabel)
      .map((key) => ({ key, label: labelFor(key) }))

    return { chips, remaining }
  }
}

export interface ResolvedBuilderTalents {
  /** Origin-granted Talents, in Archetype order — rendered as locked chips. */
  origin: string[]
  /**
   * Canonical Talents the player may pick: every Talent the Origin doesn't already
   * grant, in {@link TALENT_KEYS} order. Already-picked Talents stay in the list so
   * the picker can highlight them.
   */
  selectable: TalentKey[]
}

/**
 * Shapes the Talents picker on Movement 2 — Ortus (builder, S1 / PRD §5.2). The
 * Origin Archetype's Talents render as locked chips; the player picks extras from
 * every other canonical Talent. Order is canonical, not alphabetical — the picker
 * preserves {@link TALENT_KEYS} order and the Origin chips follow the Archetype
 * definition. Depends only on the Origin key (the builder has a draft, not a resolved
 * entity).
 */
export function resolveTalentsForBuilder(deps: Pick<GameData, "getArchetype">) {
  return (originArchetypeKey: string | null): ResolvedBuilderTalents => {
    const origin = archetypeTalents(originArchetypeKey, deps)
    const originSet = new Set(origin)
    const selectable = TALENT_KEYS.filter((key) => !originSet.has(key))
    return { origin, selectable }
  }
}
