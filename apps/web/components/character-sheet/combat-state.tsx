import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import type { BattleConditions } from "@/lib/game/character"
import type { HydratedCharacter } from "@/lib/game/hydrated-character"

import { AilmentList } from "./combat-state/ailment-list"
import { BattleConditionRow } from "./combat-state/battle-condition-row"
import { Exhaustion } from "./combat-state/exhaustion"
import { FlagRow } from "./combat-state/flag-row"
import { PartyCompositionRow } from "./combat-state/party-composition-row"

/**
 * The read-only Combat State block (PRD §6.1 Combat tab > Combat State): the
 * tracked, non-derived modifiers a player needs to see at a glance during
 * play — current Ailment(s) with their canonical effect text, the three
 * Battle Condition axes (Attack / Defense / Hit-Evasion), single-use Charged
 * and Concentrating flags, and current Exhaustion. Designed for fast scanning:
 * neutral axes recede, changes are emphasised; inactive flags vanish entirely.
 * The "Clear combat state" mutator and any per-field controls are owner-mode
 * and intentionally not surfaced here.
 *
 * Battle Condition `stacks` are not displayed: rulebook 3.8 forbids
 * constructive stacking, so `stacks > 1` only encodes extended duration —
 * meaningful once an initiative tracker exists, not before.
 */
export function CombatState({ character }: { character: HydratedCharacter }) {
  const conditions: BattleConditions = character.battleConditions ?? {
    attack: { state: "neutral", stacks: 0 },
    defense: { state: "neutral", stacks: 0 },
    hitEvasion: { state: "neutral", stacks: 0 },
    charged: false,
    concentrating: false,
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Combat State</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 items-start gap-x-2">
          <AilmentList ailmentKeys={character.ailments} />
          <Exhaustion exhaustion={character.exhaustion} />
        </div>
        <BattleConditionRow conditions={conditions} />
        <FlagRow
          charged={conditions.charged}
          concentrating={conditions.concentrating}
        />
        <PartyCompositionRow composition={character.partyComposition} />
      </CardContent>
    </Card>
  )
}
