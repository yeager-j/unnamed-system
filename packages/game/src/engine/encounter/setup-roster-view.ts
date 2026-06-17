import { type Statblock } from "@workspace/game/engine/combatant/statblock"
import { type MapInstanceState } from "@workspace/game/foundation/encounter/map-instance"
import { type CombatantSetup } from "@workspace/game/foundation/encounter/session"

/**
 * Resolves a setup combatant's *base* display name from its ref — a `pc` defers
 * to the injected name map (its name lives on the character row), an `enemy`
 * carries its name inline, and a `catalog-enemy` resolves through the hardcoded
 * catalog. The peer of {@link import("./console-view").combatantName} for the
 * pre-combat setup roster (which holds {@link CombatantSetup}s, not
 * {@link import("./session").Combatant}s). Falls back to the raw id/key so a
 * label never renders blank.
 */
function baseName(
  setup: CombatantSetup,
  pcNameById: Record<string, string>,
  enemyStatblockById: Record<string, Statblock>
): string {
  const ref = setup.ref
  switch (ref.kind) {
    case "pc":
      return pcNameById[ref.characterId] ?? ref.characterId
    case "enemy":
      return ref.statBlock.name
    case "catalog-enemy":
      return enemyStatblockById[ref.enemyKey]?.name ?? ref.enemyKey
  }
}

/**
 * Display labels for a setup roster, disambiguating duplicate combatants by
 * appending an ordinal: a base name that appears once renders as-is, and
 * repeats become "Goblin", "Goblin 2", "Goblin 3" in roster order. This is the
 * "numbered combatants" rule (UNN-346) applied at the display layer — the
 * `catalog-enemy` ref stores no per-instance name, so the number is derived from
 * the roster, never persisted. Returns one label per setup, index-aligned to the
 * input.
 */
export function buildSetupCombatantLabels(
  setups: CombatantSetup[],
  pcNameById: Record<string, string>,
  enemyStatblockById: Record<string, Statblock>
): string[] {
  // The first (or only) occurrence of a base name renders bare; later repeats get
  // their roster-order ordinal — so a singleton naturally stays un-numbered with
  // no separate up-front count.
  const seen = new Map<string, number>()
  return setups.map((setup) => {
    const name = baseName(setup, pcNameById, enemyStatblockById)
    const ordinal = (seen.get(name) ?? 0) + 1
    seen.set(name, ordinal)
    return ordinal === 1 ? name : `${name} ${ordinal}`
  })
}

/**
 * Whether every combatant has a valid zone placement (UNN-301). An encounter
 * with **no** zones defined is always "placed" — it runs unzoned / theater-of-
 * mind, the Phase 4 start path. Once the DM has authored any zones, every
 * combatant's `zoneId` must reference one that exists in `session.zones`. The
 * setup shell consumes this to gate Save draft / Start combat; it is the
 * placement half of the same referential convention the zone graph keeps at
 * runtime (zone ids are not schema-enforced on the combatant — UNN-313).
 */
export function isRosterFullyPlaced(
  setups: CombatantSetup[],
  zones: MapInstanceState["zones"]
): boolean {
  if (Object.keys(zones).length === 0) return true
  return setups.every((setup) => setup.zoneId in zones)
}

/** A combatant a given roster slot may be engaged with: its stable id + label. */
export interface EngageableTarget {
  id: string
  label: string
}

/**
 * The combatants the roster slot at `index` may be engaged with (UNN-301): every
 * *other* placed combatant in the **same zone** (engagement is melee-lock, and
 * the rules only let you Engage a creature in your current Zone — rulebook 3.5).
 * Side-agnostic: a combatant can be Engaged with an ally, not just an opponent
 * (e.g. the Confuse ailment forces engaging an ally), matching the `side`-is-
 * orthogonal stance of {@link import("./session").Engagement}. The same-zone rule
 * lives here, not in the component, so it has a single home alongside
 * {@link normalizeEngagements} (which enforces it on the stored graph). `labels`
 * is index-aligned to `setups` (e.g. from {@link buildSetupCombatantLabels}).
 */
export function engageableTargets(
  setups: CombatantSetup[],
  index: number,
  labels: string[]
): EngageableTarget[] {
  const self = setups[index]
  if (self === undefined) return []
  return setups.flatMap((setup, i) =>
    i === index || setup.id === undefined || setup.zoneId !== self.zoneId
      ? []
      : [{ id: setup.id, label: labels[i] ?? setup.id }]
  )
}

/** The combatants a setup is engaged with, or `[]` when Free. */
function engagementTargets(setup: CombatantSetup | undefined): string[] {
  return setup?.engagement?.status === "engaged"
    ? setup.engagement.targetCombatantIds
    : []
}

/** Re-stamps a setup's engagement from a target list — Free when empty. */
function withEngagementTargets(
  setup: CombatantSetup,
  targets: string[]
): CombatantSetup {
  return {
    ...setup,
    engagement:
      targets.length === 0
        ? { status: "free" }
        : { status: "engaged", targetCombatantIds: targets },
  }
}

/**
 * Sets `combatantId`'s engagement to exactly `targetIds`, **mutually** (UNN-301):
 * engagement is symmetric — if A is engaged with B then B is engaged with A. So
 * this updates both `combatantId`'s neighbor list *and* every affected target's:
 * a newly-added target gains `combatantId`, a dropped one loses it (reverting to
 * Free when it has no other links). Modelling the roster as an undirected graph
 * this way keeps both sides in lockstep no matter which combatant the DM edits;
 * {@link normalizeEngagements} (whose same-zone test is itself symmetric) then
 * preserves that invariant across placement and roster changes.
 */
export function setEngagementTargets(
  setups: CombatantSetup[],
  combatantId: string,
  targetIds: string[]
): CombatantSetup[] {
  const next = new Set(targetIds)
  const prev = new Set(
    engagementTargets(setups.find((setup) => setup.id === combatantId))
  )
  return setups.map((setup) => {
    if (setup.id === combatantId) return withEngagementTargets(setup, targetIds)
    // Stryker disable next-line ConditionalExpression: equivalent — a setup with no id can't be a target (targetIds are real ids), so it falls through to the unchanged-return below either way.
    if (setup.id === undefined) return setup

    const isTarget = next.has(setup.id)
    if (isTarget === prev.has(setup.id)) return setup

    const current = engagementTargets(setup)
    return withEngagementTargets(
      setup,
      isTarget
        ? [...new Set([...current, combatantId])]
        : current.filter((id) => id !== combatantId)
    )
  })
}

/**
 * Drops every engagement target that isn't in the **same zone** as the combatant
 * engaging it (UNN-301): two combatants can only be melee-locked when co-located.
 * "Same zone" is plain `zoneId` equality, so an unzoned encounter (every `zoneId`
 * empty) leaves engagements untouched, while moving a combatant out of its zone —
 * or removing the combatant it was engaged with — clears the now-invalid link
 * (reverting to Free when no valid target remains). Re-run after any placement or
 * roster change so the stored engagement graph never references a cross-zone or
 * missing combatant. Returns the same array reference semantics as the input is
 * not guaranteed; callers treat the result as the next roster.
 */
export function normalizeEngagements(
  setups: CombatantSetup[]
): CombatantSetup[] {
  // An id-less setup can never be referenced as an engagement target, so a
  // harmless `undefined` key in the lookup is fine — no need to filter it out.
  const zoneById = new Map(
    setups.map((setup) => [setup.id, setup.zoneId] as const)
  )
  return setups.map((setup) => {
    const engagement = setup.engagement
    if (engagement === undefined || engagement.status !== "engaged")
      return setup
    const valid = engagement.targetCombatantIds.filter(
      (id) => zoneById.get(id) === setup.zoneId
    )
    // Stryker disable next-line ConditionalExpression: equivalent — when every target is valid the rebuild below reproduces the same engagement value; this early return is only a re-allocation optimization.
    if (valid.length === engagement.targetCombatantIds.length) return setup
    return {
      ...setup,
      engagement:
        valid.length === 0
          ? { status: "free" }
          : { status: "engaged", targetCombatantIds: valid },
    }
  })
}
