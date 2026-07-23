/**
 * Maps any dungeon Server Action error to its user-facing toast copy. Shared by
 * every dungeon write surface (the run console's turn loop / move / reveal, the
 * delve-start + search-that-reveals gestures, the status flip, the pre-combat
 * staging surface, and the reminder settings) so the phrasing can't drift between them — the dungeon peer of
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
  | "delve-is-expedition"
  | "not-an-expedition"
  | "delve-has-live-encounter"
  | "region-not-found"
  | "template-set-not-found"
  | "generation-event-not-supported"
  | "expansion-failed"
  | "forced-template-not-mintable"
  | "retract-zone-not-generated"
  | "retract-zone-revealed"
  | "retract-zone-not-leaf"
  | "retract-zone-occupied"
  | "retract-zone-in-encounter"
  | "campaign-already-has-live-encounter"
  | "encounter-has-unplaced-combatants"
  | "character-not-found"
  | "character-not-in-campaign"
  | "unknown-enemy"
  | "locator-missing"

export function dungeonErrorMessage(error: DungeonActionError): string {
  switch (error) {
    case "character-not-found":
      return "A party member no longer exists. Reload and try again."
    case "character-not-in-campaign":
      return "That character isn't placed in this campaign. Reload and try again."
    case "unknown-enemy":
      return "One of the staged enemies isn't in the catalog anymore."
    case "locator-missing":
      return "Something looks off with the roster. Reload and try again."
    case "campaign-already-has-active-delve":
      return "This campaign already has an active delve."
    case "delve-not-draft":
      return "This delve has already started."
    case "delve-not-active":
      return "This delve isn't running. Reload and try again."
    case "delve-is-expedition":
      return "This is a Region expedition — run it from its Region."
    case "not-an-expedition":
      return "This delve doesn't belong to a Region."
    case "delve-has-live-encounter":
      return "Finish the live encounter before finishing the expedition."
    case "region-not-found":
      return "This Region no longer exists."
    case "template-set-not-found":
      return "This Region's Template Set no longer exists."
    case "generation-event-not-supported":
      return "That gesture isn't available yet. Reload and try again."
    case "expansion-failed":
      return "The expansion roll failed. Reload and try again."
    case "forced-template-not-mintable":
      return "That template can't be placed from this passage."
    case "retract-zone-not-generated":
      return "Only generated rooms can be retracted."
    case "retract-zone-revealed":
      return "Players have seen this room. Hide it first."
    case "retract-zone-not-leaf":
      return "Retract this room's deeper rooms first."
    case "retract-zone-occupied":
      return "Someone is standing in this room. Move them out first."
    case "retract-zone-in-encounter":
      return "Finish the live encounter first."
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
