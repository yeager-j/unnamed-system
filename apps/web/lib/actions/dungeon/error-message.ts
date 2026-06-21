/**
 * Maps any dungeon Server Action error to its user-facing toast copy. Shared by
 * every dungeon write surface (the run console's turn loop / move / reveal, the
 * delve-start + search-that-reveals gestures, the status flip, and the reminder
 * settings) so the phrasing can't drift between them — the dungeon peer of
 * `encounterErrorMessage`. The union is the superset of every dungeon action's
 * error type; a narrower per-action error is assignable to it.
 */
export type DungeonActionError =
  | "invalid-input"
  | "dungeon-not-found"
  | "stale"
  | "map-instance-not-found"
  | "missing-instance-version"
  | "delve-not-draft"
  | "campaign-already-has-active-delve"
  | "map-not-found"
  | "delve-not-active"
  | "campaign-already-has-live-encounter"
  | "encounter-has-unplaced-combatants"

export function dungeonErrorMessage(error: DungeonActionError): string {
  switch (error) {
    case "campaign-already-has-active-delve":
      return "This campaign already has an active delve."
    case "delve-not-draft":
      return "This delve has already started."
    case "delve-not-active":
      return "This delve isn't running. Reload and try again."
    case "campaign-already-has-live-encounter":
      return "This campaign already has a live encounter."
    case "encounter-has-unplaced-combatants":
      return "Place every combatant in a zone before starting combat."
    case "map-not-found":
      return "This dungeon's map is missing. Author it on My Maps and try again."
    case "stale":
      return "This delve changed elsewhere. Reload and try again."
    case "dungeon-not-found":
      return "This delve no longer exists."
    case "map-instance-not-found":
      return "This delve's map is missing. Reload and try again."
    case "missing-instance-version":
      return "Something looks off with the map. Reload and try again."
    case "invalid-input":
      return "Something looks off. Try again."
  }
}
