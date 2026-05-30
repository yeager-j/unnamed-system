import { getArchetype } from "../../archetypes"
import { getTalent, TALENT_KEYS, type TalentKey } from "./registry"

const labelFor = (key: TalentKey): string => getTalent(key)?.name ?? key

const byLabel = (a: TalentKey, b: TalentKey): number =>
  labelFor(a).localeCompare(labelFor(b))

const archetypeTalents = (archetypeKey: string | null): TalentKey[] =>
  archetypeKey ? (getArchetype(archetypeKey)?.talents ?? []) : []

export interface TalentChip {
  key: TalentKey
  label: string
  inherited: boolean
}

export interface ResolvedSheetTalents {
  /** Inherited Talents (alpha) followed by gained Talents (alpha) — render order. */
  chips: TalentChip[]
  /** Canonical Talents the character doesn't have yet (alpha) — feeds the Add popover. */
  remaining: { key: TalentKey; label: string }[]
}

/**
 * Shapes the Talents block on the sheet's Explore tab (UNN-222). A character's
 * Talents come from two sources the tab renders differently: those granted by
 * the **active Archetype** (locked, not removable) and those the player
 * **gained** via Background or downtime (removable). Inherited chips sort ahead
 * of gained chips, each block alphabetical by display label; `remaining` is
 * every canonical Talent neither source already grants, so the Add popover only
 * offers picks the character can actually learn.
 */
export function resolveTalentsForSheet(
  gainedTalents: TalentKey[],
  activeArchetypeKey: string | null
): ResolvedSheetTalents {
  const inherited = archetypeTalents(activeArchetypeKey)
  const chips: TalentChip[] = [
    ...[...inherited]
      .sort(byLabel)
      .map((key) => ({ key, label: labelFor(key), inherited: true })),
    ...[...gainedTalents]
      .sort(byLabel)
      .map((key) => ({ key, label: labelFor(key), inherited: false })),
  ]

  const known = new Set<TalentKey>([...inherited, ...gainedTalents])
  const remaining = TALENT_KEYS.filter((key) => !known.has(key))
    .sort(byLabel)
    .map((key) => ({ key, label: labelFor(key) }))

  return { chips, remaining }
}

export interface ResolvedBuilderTalents {
  /** Origin-granted Talents, in Archetype order — rendered as locked chips. */
  origin: TalentKey[]
  /**
   * Canonical Talents the player may pick: every Talent the Origin doesn't
   * already grant, in `TALENT_KEYS` order. Already-picked Talents stay in the
   * list so the picker can highlight them.
   */
  selectable: TalentKey[]
}

/**
 * Shapes the Talents picker on Movement 2 — Ortus (UNN-222 / PRD §5.2). The
 * Origin Archetype's Talents render as locked chips; the player picks extras
 * from every other canonical Talent. Order is canonical, not alphabetical —
 * the picker preserves `TALENT_KEYS` order and the Origin chips follow the
 * Archetype definition. Player-gained picks aren't excluded from `selectable`
 * (the picker keeps them visible), so this depends only on the Origin key.
 */
export function resolveTalentsForBuilder(
  originArchetypeKey: string | null
): ResolvedBuilderTalents {
  const origin = [...archetypeTalents(originArchetypeKey)]
  const originSet = new Set(origin)
  const selectable = TALENT_KEYS.filter((key) => !originSet.has(key))
  return { origin, selectable }
}
