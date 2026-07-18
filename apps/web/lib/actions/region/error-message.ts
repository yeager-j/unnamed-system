/**
 * Maps any Region Server Action error to its user-facing toast copy. Shared by
 * every Region write surface (create, settings, archive, delete) so the phrasing
 * can't drift between them — the Region peer of `dungeonErrorMessage`. The union is
 * the superset of every Region action's error type; a narrower per-action error is
 * assignable to it.
 */
export type RegionActionError =
  | "invalid-input"
  | "region-not-found"
  | "stale"
  | "map-not-found"
  | "template-set-not-found"
  | "wandering-table-not-found"
  | "region-has-expeditions"

export function regionErrorMessage(error: RegionActionError): string {
  switch (error) {
    case "map-not-found":
      return "That seed map is missing. Author it on the Stage and try again."
    case "template-set-not-found":
      return "That template set is missing. Author it on the Stage and try again."
    case "wandering-table-not-found":
      return "The chosen wandering table isn't in this set anymore. Pick another."
    case "region-has-expeditions":
      return "This Region has expeditions — archive it instead of deleting."
    case "region-not-found":
      return "This Region no longer exists."
    case "stale":
      return "This Region changed elsewhere. Reload and try again."
    case "invalid-input":
      return "Something looks off. Try again."
  }
}
