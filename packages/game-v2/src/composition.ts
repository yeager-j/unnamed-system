import {
  applySetInheritanceSlot,
  applySetOrigin,
  applySpendArchetypeRank,
  archetypesByLineage,
  buildLineageAtlas,
  creationArchetypes,
  getAtlasRecommendations,
  resolveArchetypeRoster,
} from "@workspace/game-v2/archetypes"
import { gameData } from "@workspace/game-v2/catalog"
import {
  createSessionFactory,
  instantiateCatalogEnemy,
  mapInstanceComponentsFor,
  resolveSession,
  spatialReadsFor,
  type ParticipantSetup,
  type Session,
} from "@workspace/game-v2/encounter"
import {
  applyInventoryMutation,
  resolveBasicAttack,
  resolveInventory,
  type IntrinsicAttack,
  type InventoryItemState,
  type InventoryMutation,
} from "@workspace/game-v2/items"
import type { Entity } from "@workspace/game-v2/kernel/entity"
import type { GameData } from "@workspace/game-v2/kernel/ports"
import type { Lineage } from "@workspace/game-v2/kernel/vocab"
import {
  createResolve,
  createResolveEntity,
  resolveCreationArchetypeSkills,
} from "@workspace/game-v2/resolve"
import type { MapInstanceState } from "@workspace/game-v2/spatial"
import {
  resolveOriginTalentChoices,
  resolveTalentRoster,
  resolveTalents,
} from "@workspace/game-v2/talents"

/**
 * The **composition root** (D33, the `createGameEngine` equivalent): the one place
 * that binds the concrete {@link gameData} catalog adapter into the engine's
 * pure, port-shaped functions. Engine logic stays catalog-agnostic (it declares
 * `Pick<GameData, ...>` slices); this seam wires the real adapter once, so app
 * code imports pre-bound functions and never the catalog.
 *
 * It is one of two files (with `catalog/index.ts`) allowed to name a `catalog`
 * import directly. PR2 (UNN-500) binds the base-layer `resolve`; each domain PR
 * binds its functions here.
 */
export function createGameEngine(deps: GameData = gameData) {
  // The pure base fold + the app-facing mechanic-aware resolve, hoisted so the
  // resolved-encounter view below binds the same instance.
  const resolve = createResolve(deps)
  const resolveEntity = createResolveEntity(deps)

  return {
    // The pure base fold (golden-master + pure-fold tests bind this directly).
    resolve,
    // The app-facing resolve: applies the active mechanic's form + effects (incl. the
    // PR5 equipment contribution) on top of the base fold (PR4 — UNN-502).
    resolveEntity,
    // Items (PR5 — UNN-503): the mutation engine + inventory resolution + basic-attack
    // resolver, bound to the catalog so app surfaces call them without the lookups.
    applyInventoryMutation: (
      items: readonly InventoryItemState[],
      mutation: InventoryMutation,
      newId: () => string
    ) => applyInventoryMutation(items, mutation, deps, newId),
    resolveInventory: (items: readonly InventoryItemState[]) =>
      resolveInventory(deps, items),
    // The whole-catalog enumeration behind the add-item picker (UNN-559). The
    // granular per-op bindings (`equipItem`…, UNN-552) were dropped the same
    // ticket: the equipment Writer drives `applyInventoryMutation` (the router),
    // and no surface composed a single op.
    allItems: () => deps.allItems(),
    resolveBasicAttack: (
      entity: Entity,
      formNaturalAttack: IntrinsicAttack | null
    ) => resolveBasicAttack(deps, entity, formNaturalAttack),
    // Encounter (UNN-515): mint a fresh Session from setup, instantiating any
    // catalog-enemy setup entries via `getEnemy`. `newId` is a runtime arg (the
    // applyInventoryMutation pattern), bound by the caller per mint.
    createSession: (setup: ParticipantSetup[], newId: () => string) =>
      createSessionFactory(deps, newId)(setup),
    // The post-mint catalog materialization (UNN-535): a bulk catalog add
    // appends to an existing session, so it instantiates enemies here instead
    // of re-minting; `undefined` flags a wire-supplied unknown key to reject.
    instantiateEnemy: instantiateCatalogEnemy(deps),
    // Resolved-encounter view (UNN-525, read-bag wired UNN-529): resolve every
    // participant once with zone context, and fill the instance read-bag
    // (`position`/`engagement`) from the Map-Instance occupancy — both adapters
    // (SD8) bound here over the instance, so the caller passes state, not ports.
    resolveSession: (session: Session, mapInstance: MapInstanceState) =>
      resolveSession(
        session,
        spatialReadsFor(mapInstance),
        resolveEntity,
        mapInstanceComponentsFor(mapInstance)
      ),
    // Archetypes (PR6 — UNN-504): content-named roster, Atlas, lineage groups, and
    // creation-Skill reads bound to the catalog. These functions read the archetype
    // roster off the ResolvedEntity (the resolved Archetypes read-unit); the caller
    // resolves first, then hands the resolved entity here.
    resolveArchetypeRoster: resolveArchetypeRoster(deps),
    buildLineageAtlas: buildLineageAtlas(deps),
    getAtlasRecommendations: getAtlasRecommendations(deps),
    archetypesByLineage: archetypesByLineage(deps),
    resolveCreationArchetypeSkills: resolveCreationArchetypeSkills(deps),
    // Creation-eligible Origin set (E1 — UNN-552): the catalog filtered to the
    // initiate tier, bound over the `allArchetypes` port.
    creationArchetypes: creationArchetypes(deps),
    // Starting weapon by Origin Lineage (S1 — UNN-556): the finalize action seeds
    // the equipment component with it. A direct port pass-through, as is the
    // catalog Archetype lookup finalize resolves the Origin through.
    startingWeaponForLineage: (lineage: Lineage) =>
      deps.startingWeaponForLineage(lineage),
    getArchetype: (key: string) => deps.getArchetype(key),
    // The archetype write transitions (UNN-595): the roster edits that own their
    // rulebook invariants — Origin minting, Inheritance-Slot fills, and the
    // Saved-Rank economy — bound to the catalog so the entity write door's four
    // rule-bearing arms reduce to capability-check → transition → merge.
    applySetOrigin: applySetOrigin(deps),
    applySetInheritanceSlot: applySetInheritanceSlot(deps),
    applySpendArchetypeRank: applySpendArchetypeRank(deps),
    // Talent resolution (E3 — UNN-554): the derived Talent roster (owned +
    // active-Archetype union), full content roster, and Origin choices. Surface
    // partitions live in the app view layer; only `getArchetype` is injected here.
    resolveTalents: (ownedKeys: string[], activeArchetypeKey: string | null) =>
      resolveTalents(ownedKeys, activeArchetypeKey, deps),
    resolveTalentRoster: resolveTalentRoster(deps),
    resolveOriginTalentChoices: resolveOriginTalentChoices(deps),
  }
}

export type GameEngine = ReturnType<typeof createGameEngine>
