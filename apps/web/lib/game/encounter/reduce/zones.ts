import { produce, type Draft } from "immer"

import type { CombatSession, Zone } from "../session"
import type { ZoneGraphEvent } from "../session-event"

/** Records `to` in `from`'s adjacency list, creating the list if absent and
 *  skipping a duplicate so re-adding an existing edge is idempotent. */
function addEdge(draft: Draft<CombatSession>, from: string, to: string): void {
  const neighbors = (draft.adjacency[from] ??= [])
  if (!neighbors.includes(to)) neighbors.push(to)
}

/** Drops `to` from `from`'s adjacency list (a no-op when absent). */
function removeEdge(
  draft: Draft<CombatSession>,
  from: string,
  to: string
): void {
  const neighbors = draft.adjacency[from]
  if (neighbors === undefined) return
  const index = neighbors.indexOf(to)
  if (index !== -1) neighbors.splice(index, 1)
}

/**
 * Zone-graph slice (UNN-313). Mutates the spatial graph on the session — never a
 * combatant — following the Immer-draft style of {@link reduceRoundEvent}:
 *
 * - `addZone` mints a stable id via `newId` (same injectable as `addCombatant`)
 *   and stores a self-describing {@link Zone} under that key. `notes` is only
 *   set when provided, keeping the stored object `undefined`-clean.
 * - `removeZone` deletes the zone and its own adjacency entry, then prunes the
 *   removed id from every *other* zone's adjacency list. It deliberately leaves
 *   `combatant.zoneId` untouched — placement cleanup is UNN-315's concern.
 * - `setZoneAdjacency` writes (or clears) an **undirected** edge by mirroring the
 *   change into both zones' lists; idempotent on re-add (see {@link addEdge}). It
 *   no-ops unless **both** zones exist (so an edge can never point at a missing
 *   zone) and when the two ids are equal (a zone is never adjacent to itself).
 * - `renameZone` updates a zone's display name.
 *
 * Each event is a no-op when a referenced zone id is unknown — Immer returns the
 * original session unchanged when no draft mutation occurs (the convention
 * `removeCombatant` relies on too).
 */
export function reduceZoneGraphEvent(
  session: CombatSession,
  event: ZoneGraphEvent,
  newId: () => string
): CombatSession {
  return produce(session, (draft) => {
    switch (event.kind) {
      case "addZone": {
        const id = newId()
        const zone: Zone = { id, name: event.name }
        if (event.notes !== undefined) zone.notes = event.notes
        draft.zones[id] = zone
        return
      }

      case "removeZone": {
        if (draft.zones[event.zoneId] === undefined) return
        delete draft.zones[event.zoneId]
        delete draft.adjacency[event.zoneId]
        for (const zoneId of Object.keys(draft.adjacency)) {
          removeEdge(draft, zoneId, event.zoneId)
        }
        return
      }

      case "setZoneAdjacency": {
        if (event.zoneIdA === event.zoneIdB) return
        const bothExist =
          draft.zones[event.zoneIdA] !== undefined &&
          draft.zones[event.zoneIdB] !== undefined
        if (!bothExist) return
        if (event.adjacent) {
          addEdge(draft, event.zoneIdA, event.zoneIdB)
          addEdge(draft, event.zoneIdB, event.zoneIdA)
        } else {
          removeEdge(draft, event.zoneIdA, event.zoneIdB)
          removeEdge(draft, event.zoneIdB, event.zoneIdA)
        }
        return
      }

      case "renameZone": {
        const zone = draft.zones[event.zoneId]
        if (zone === undefined) return
        zone.name = event.name
        return
      }
    }
  })
}
