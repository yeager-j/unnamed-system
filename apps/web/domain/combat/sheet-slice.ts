import type { ResolvedSkill } from "@workspace/game-v2/skills/resolved"

/** The display data only a character sheet contributes to a combatant drawer —
 *  the loader (`lib/db/queries/load-combat-console-data.ts`) decides which
 *  participants have a sheet and emits only this content; inline combatants
 *  have no slice and use their session-resolved Skills instead. */
export interface CombatantSheetSlice {
  className: string | null
  pronouns: string | null
  skills: ResolvedSkill[]
}
