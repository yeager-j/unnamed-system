import { buildStatContext } from "@workspace/game/engine/character/stats/stat-character"
import {
  accumulatedBonuses,
  computeAffinityChart,
  computeAttributes,
  computeMaxHitDice,
  computeMaxHP,
  computeMaxSkillDice,
  computeMaxSP,
  type StatContext,
} from "@workspace/game/engine/character/stats/stats"
import { resolveTalents } from "@workspace/game/engine/character/talents/utils"
import {
  resolveAttackRoll,
  skillAttackRollContext,
  type AttackRollContext,
} from "@workspace/game/engine/combat/attack-roll"
import { resolveDamageBonuses } from "@workspace/game/engine/combat/damage-bonus"
import { getEquippedItem } from "@workspace/game/engine/items/utils"
import { type GameData } from "@workspace/game/engine/ports"
import { hydrateSkill } from "@workspace/game/engine/skills/utils"
import type { HydratedCharacter } from "@workspace/game/foundation/character/hydrated-character"
import type {
  CharacterArchetypeRow,
  CharacterChainRow,
  CharacterKnifeRow,
  CharacterRow,
  InventoryItemRow,
} from "@workspace/game/foundation/character/records"
import { type CombatContext } from "@workspace/game/foundation/character/state"
import { type IntrinsicAttack } from "@workspace/game/foundation/items/schema"

/**
 * The persisted inputs a {@link HydratedCharacter} is derived from: the
 * `characters` row plus its four child-row sets. The DB owns *fetching* these
 * ({@link loadHydratedCharacterById} et al.); {@link deriveHydratedCharacter}
 * turns them into the sheet view with no I/O, so the same derivation runs on
 * the server (after a query) and on the client (for an optimistic frame, after
 * {@link toRawInputs}). Row shapes are type-only imports from the db layer —
 * erased at runtime, so this module stays db-free and client-safe.
 */
export interface RawCharacterInputs {
  row: CharacterRow
  archetypeRows: CharacterArchetypeRow[]
  inventoryRows: InventoryItemRow[]
  knives: CharacterKnifeRow[]
  chains: CharacterChainRow[]
}

/**
 * The catalog slice the character hydration pipeline reads — shared verbatim by
 * {@link deriveHydratedCharacter} and {@link reduceCharacter} (which re-derives
 * through it after every edit).
 */
export type CharacterLookups = Pick<
  GameData,
  "getArchetype" | "getSkill" | "getItem" | "getEquippableItem" | "getTalent"
>

/**
 * Projects the persisted state onto the pure engine input. Only equipped
 * inventory items are passed through so item effects stay gated to what the
 * character actually has equipped; the combat context's zone effects ride in
 * as {@link StatContext.contextEffects}.
 */
function statContext(
  { row, archetypeRows, inventoryRows }: RawCharacterInputs,
  lookups: CharacterLookups,
  context: CombatContext | undefined
): StatContext {
  return buildStatContext(lookups)(
    {
      pathChoice: row.pathChoice,
      level: row.level,
      manualBonuses: row.manualBonuses,
      activeCharacterArchetypeId: row.activeArchetypeId,
    },
    archetypeRows.map((archetype) => ({
      id: archetype.id,
      archetypeKey: archetype.archetypeKey,
      rank: archetype.rank,
      inheritanceSlots: archetype.inheritanceSlots,
      mechanicState: archetype.mechanicState,
    })),
    inventoryRows
      .filter((item) => item.equipped)
      .map((item) => item.catalogItemKey),
    // Stryker disable next-line ArrayDeclaration: equivalent — every contextEffects consumer (attribute, affinity, attack-roll, damage-bonus folds) filters by `effect.type`, so a junk fallback element contributes nothing and is indistinguishable from `[]`.
    context?.zoneEffects ?? []
  )
}

function weaponAttackContext(attack: IntrinsicAttack): AttackRollContext {
  return {
    kind: "attack",
    damageType: attack.damageType,
    delivery: attack.delivery,
    attribute: attack.attackRoll.attribute,
  }
}

/**
 * The pure half of character hydration: turns {@link RawCharacterInputs} into
 * the complete {@link HydratedCharacter} sheet view — every persisted column
 * spread flat, the child rows, and every engine-derived value. No I/O, so it is
 * the single source of truth shared by the server loader and any client
 * optimistic frame; deriving twice from the same inputs yields the same view by
 * construction, so an optimistic frame can never structurally drift from the
 * server's.
 *
 * `context` carries the optional encounter-scoped inputs — the party
 * composition the `perPartyLineage` Attack-Roll scaler needs, and the
 * already-resolved effects of the combatant's current Zone (`zoneEffects`,
 * e.g. a Toccata Enchantment's Attack-Roll bonus) — supplied only by an
 * encounter-aware caller (the tracker). Omitted on the standalone sheet, so
 * Magic Circle / Ailment Boost resolve at zero allies and no zone effects
 * apply — their **base** values; both are combat-context displays, not sheet
 * fields.
 */
export function deriveHydratedCharacter(lookups: CharacterLookups) {
  return (
    raw: RawCharacterInputs,
    context?: CombatContext
  ): HydratedCharacter => {
    const { row, archetypeRows, inventoryRows, knives, chains } = raw
    const partyComposition = context?.partyComposition ?? null

    const stats = statContext(raw, lookups, context)
    const bonuses = accumulatedBonuses(stats)
    const maxHP = computeMaxHP(stats, bonuses)

    const inventory = inventoryRows.map((inventoryRow) => ({
      ...inventoryRow,
      item: lookups.getItem(inventoryRow.catalogItemKey),
    }))

    const weapon = getEquippedItem(inventory, "weapon")
    const weaponContext = weapon
      ? weaponAttackContext(weapon.equip.intrinsicAttack)
      : null
    const weaponAttackRoll = weaponContext
      ? resolveAttackRoll(weaponContext, stats, partyComposition)
      : null
    const weaponDamageBonuses = weaponContext
      ? resolveDamageBonuses(weaponContext, stats)
      : []

    return {
      ...row,
      archetypeRows,
      knives,
      chains,
      talents: resolveTalents(
        row.gainedTalents,
        stats.activeArchetypeKey,
        lookups
      ),
      inventory,
      activeArchetypeKey: stats.activeArchetypeKey,
      attributes: computeAttributes(stats, bonuses),
      maxHP,
      maxSP: computeMaxSP(stats, bonuses),
      maxHitDice: computeMaxHitDice(row.level),
      maxSkillDice: computeMaxSkillDice(row.level),
      affinityChart: computeAffinityChart(stats),
      weaponAttackRoll,
      weaponDamageBonuses,
      activeMechanic: stats.activeMechanic,
      skills: stats.activeSkills.map((skill) => {
        const skillContext = skillAttackRollContext(skill)
        return hydrateSkill(
          skill,
          maxHP,
          skillContext
            ? resolveAttackRoll(skillContext, stats, partyComposition)
            : null,
          skillContext ? resolveDamageBonuses(skillContext, stats) : []
        )
      }),
    }
  }
}

/**
 * The inverse projection: recovers the {@link RawCharacterInputs} a
 * {@link HydratedCharacter} was derived from, by stripping the derived fields
 * back off. Lets a client optimistic reducer round-trip through the pure
 * engine — `deriveHydratedCharacter(applyEdit(toRawInputs(current)))` — instead
 * of hand-patching the derived view. `deriveHydratedCharacter(toRawInputs(c))`
 * deep-equals `c`; the derive-tests assert this so a new derived field that
 * isn't mirrored here is caught.
 */
export function toRawInputs(character: HydratedCharacter): RawCharacterInputs {
  const {
    archetypeRows,
    knives,
    chains,
    inventory,
    talents: _talents,
    activeArchetypeKey: _activeArchetypeKey,
    attributes: _attributes,
    maxHP: _maxHP,
    maxSP: _maxSP,
    maxHitDice: _maxHitDice,
    maxSkillDice: _maxSkillDice,
    affinityChart: _affinityChart,
    weaponAttackRoll: _weaponAttackRoll,
    activeMechanic: _activeMechanic,
    skills: _skills,
    ...row
  } = character

  return {
    row,
    archetypeRows,
    inventoryRows: inventory.map(
      ({ item: _item, ...inventoryRow }) => inventoryRow
    ),
    knives,
    chains,
  }
}
