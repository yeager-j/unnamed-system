import {
  archetypeSwitcherGroups,
  buildArchetypeEntries,
  buildLineageAtlas,
  getArchetypeDisplay,
  getAtlasRecommendations,
  previewArchetypeSkills,
} from "@workspace/game-v2/archetypes"
import { gameData } from "@workspace/game-v2/catalog"
import {
  compareInitiative,
  createReduceEncounter,
  createReduceSession,
  createSessionFactory,
  derivePartyComposition,
  derivePartyCompositionBySide,
  endOfTurnObligations,
  fallenParticipantIds,
  participantDisplayNames,
  resolveSession,
  type CombatEvent,
  type EncounterState,
  type ParticipantSetup,
  type Session,
  type SessionEvent,
  type SpatialReads,
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
import { createResolve, createResolveEntity } from "@workspace/game-v2/resolve"

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
    resolveBasicAttack: (
      entity: Entity,
      formNaturalAttack: IntrinsicAttack | null
    ) => resolveBasicAttack(deps, entity, formNaturalAttack),
    // Encounter (UNN-515): mint a fresh Session from setup, instantiating any
    // catalog-enemy setup entries via `getEnemy`. `newId` is a runtime arg (the
    // applyInventoryMutation pattern), bound by the caller per mint.
    createSession: (setup: ParticipantSetup[], newId: () => string) =>
      createSessionFactory(deps, newId)(setup),
    // The pure combat-session reducer + its composition root (UNN-517). `newId`
    // is injected here (R24.3) — the reducer carries no catalog dep (CD4). The
    // session reducer accepts the full `SessionEvent` (the write-router feeds it
    // the ephemeral vitals events); `reduceEncounter` routes the generic
    // `CombatEvent` wire over `EncounterState`, the instance left opaque.
    reduceSession: (
      session: Session,
      event: SessionEvent,
      newId: () => string
    ) => createReduceSession(newId)(session, event),
    reduceEncounter: <Instance>(
      state: EncounterState<Instance>,
      event: CombatEvent,
      newId: () => string
    ) => createReduceEncounter(newId)(state, event),
    // Resolved-encounter view (UNN-525): resolve every participant exactly once,
    // with its zone-enchantment context, into the single view the turn-loop reads +
    // the snapshot fold over (≈5N+1 per-render resolves → N).
    resolveSession: (session: Session, spatial: SpatialReads) =>
      resolveSession(session, spatial, resolveEntity),
    // Turn loop (UNN-518): pure functions of the resolved view — no `resolve`
    // partial-application (UNN-525), so they're re-exposed as-is. The pure session
    // selectors (pendingParticipants / nextDraftingSide / eligibleParticipants /
    // actionAvailability) take no view and are imported from the encounter barrel.
    compareInitiative,
    fallenParticipantIds,
    derivePartyComposition,
    derivePartyCompositionBySide,
    participantDisplayNames,
    endOfTurnObligations,
    // Archetypes (PR6 — UNN-504): the Atlas, archetype display/preview, and the
    // switcher, bound to the catalog. The display/atlas functions read the archetype
    // roster off the ResolvedEntity (the resolved Archetypes read-unit); the caller
    // resolves first, then hands the resolved entity here.
    getArchetypeDisplay: getArchetypeDisplay(deps),
    buildArchetypeEntries: buildArchetypeEntries(deps),
    buildLineageAtlas: buildLineageAtlas(deps),
    getAtlasRecommendations: getAtlasRecommendations(deps),
    archetypeSwitcherGroups: archetypeSwitcherGroups(deps),
    previewArchetypeSkills: previewArchetypeSkills(deps),
  }
}

export type GameEngine = ReturnType<typeof createGameEngine>
