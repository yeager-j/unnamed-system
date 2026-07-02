import type { Entity } from "@workspace/game-v2/kernel"
import type { Mechanics } from "@workspace/game-v2/mechanics/mechanics.schema"
import type { RawCharacterInputs } from "@workspace/game/engine"

/**
 * The **`CharacterRow → Entity` projection adapter** (UNN-500) — the transition
 * shim that maps v1's persisted character inputs onto a v2 component {@link Entity}.
 * It lives in `apps/web`, not `game-v2`, because it must read v1's `CharacterRow`
 * and v2 is independence-gated (no `@workspace/game` imports inside its `src`);
 * the in-package `loader.ts` stays deferred to cutover for the same reason.
 *
 * It projects the derivation inputs + the stat capabilities the base-layer
 * `resolve` consumes, plus the `equipment` / `mechanics` / `talents` components
 * the sheet projection reads (UNN-533). A PC's stat capabilities carry a
 * zeros/neutral/0 `base` (D37) — its real values come from the `Archetypes` +
 * `Level`/`Path` layers, which are the rest of the entity.
 *
 * The depletion fields default to **0** (full pools): v1 stores `currentHP`, but v2
 * stores `damage = maxHP − currentHP`, and the real maxHP isn't known at projection
 * time (it's derived). The sheet's current pools stay CharacterRow passthrough
 * (UNN-533); the **encounter loader** joins the row's absolute pools back on as
 * signed depletion after one resolve (`withRowDepletion`,
 * `lib/db/queries/load-encounter-v2.ts` — the UNN-535 cutover of this note), so
 * combat surfaces see true pools. Exhaustion is a presence-based component
 * projected by its consuming PR. */
export function rawInputsToEntity(raw: RawCharacterInputs): Entity {
  const { row, archetypeRows, inventoryRows } = raw

  // v1 identifies the active Archetype by a surrogate row id; v2 keys the roster
  // by Archetype key (one entry per Archetype — D36), so resolve the id to a key.
  const keyOf = (id: string | null) =>
    archetypeRows.find((a) => a.id === id)?.archetypeKey ?? null

  return {
    id: row.id,
    components: {
      identity: { name: row.name },
      level: { value: row.level },
      path: { choice: row.pathChoice },
      archetypes: {
        active: keyOf(row.activeArchetypeId),
        origin: keyOf(row.originCharacterArchetypeId),
        savedArchetypeRanks: row.savedArchetypeRanks,
        roster: archetypeRows.map((a) => ({
          key: a.archetypeKey,
          rank: a.rank,
          // v1 slots reference the source by surrogate row id; v2 keys by Archetype
          // key (D36 / UNN-504), so translate each source id through `keyOf`.
          inheritanceSlots: a.inheritanceSlots.map((slot) => ({
            slotIndex: slot.slotIndex,
            sourceArchetypeKey: keyOf(slot.sourceCharacterArchetypeId),
            skillKey: slot.skillKey,
          })),
        })),
      },
      manualBonuses: row.manualBonuses,
      // v1 persists one nullable `mechanicState` per Archetype row; v2 keys the
      // Mechanics component by mechanic kind (D36 — the state's own discriminant,
      // 1:1 with its Archetype, so folding the rows can't collide).
      mechanics: {
        states: Object.fromEntries(
          archetypeRows
            .flatMap((a) => (a.mechanicState ? [a.mechanicState] : []))
            .map((state) => [state.kind, state])
        ) as Mechanics["states"],
      },
      equipment: {
        items: inventoryRows.map(
          ({ id, catalogItemKey, equipped, quantity }) => ({
            id,
            catalogItemKey,
            equipped,
            quantity,
          })
        ),
      },
      talents: row.gainedTalents.map((key) => ({ key })),
      // A PC's stat capabilities have a zeros/neutral/0 base (D37); the Archetypes
      // + Level/Path layers above supply its real values.
      attributes: { base: { strength: 0, magic: 0, agility: 0, luck: 0 } },
      affinities: { base: {} },
      vitals: { base: 0, damage: 0 },
      skillPool: { base: 0, spSpent: 0 },
      // A leveled PC carries its consumable spend-state, so `resolve` emits the dice
      // pools. Projected at full (zeros) here — the real `used` counts (from the
      // row's `*Remaining` columns) join with the depletion projection at cutover.
      resources: { hitDiceUsed: 0, skillDiceUsed: 0, prismaUsed: 0 },
    },
  }
}
