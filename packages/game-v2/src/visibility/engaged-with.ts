import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { Engagement } from "@workspace/game-v2/kernel/vocab/engagement"

/**
 * The combatant ids this participant is melee-locked with, or `[]` (the v1 ENG-5
 * accessor, un-stubbing the snapshot's `engagedWith`, CD17). Reads the **projected
 * Engagement component** that {@link import("./visibility-table").VISIBILITY} keeps
 * public to every viewer, so it works on a redacted {@link
 * import("./visible-entity").VisibleCombatant} too.
 *
 * Returns `[]` **structurally** in both no-link cases: when Free
 * (`{ status: "free" }`), and when the component is **absent** — a mapless
 * encounter carries no occupancy token, so the loader injects no `engagement` key
 * (`undefined`). Byte-identical to the old hardcoded `[]` stub whenever Free.
 */
export function engagedWith(
  engagement: Engagement | undefined
): ParticipantId[] {
  return engagement?.status === "engaged" ? engagement.targetCombatantIds : []
}
