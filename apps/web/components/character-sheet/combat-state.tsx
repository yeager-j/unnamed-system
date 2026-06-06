"use client"

import { DEFAULT_BATTLE_CONDITIONS } from "@workspace/game/character"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { OwnerOnly } from "@/components/shell/viewer-role"
import { useCharacter } from "@/hooks/use-character"

import { AilmentEditor } from "./combat-state/ailment-editor"
import { BattleConditionRow } from "./combat-state/battle-condition-row"
import { ClearCombatStateButton } from "./combat-state/clear-combat-state-button"
import { Exhaustion } from "./combat-state/exhaustion"
import { FlagRow } from "./combat-state/flag-row"
import { PartyCompositionRow } from "./combat-state/party-composition-row"
import { PrismaRow } from "./combat-state/prisma-row"

/**
 * The Combat State block (PRD §6.1 Combat tab > Combat State): the tracked,
 * non-derived modifiers a player needs to see at a glance during play —
 * current Ailment(s) with their canonical effect text, the three Battle
 * Condition axes (Attack / Defense / Hit-Evasion), single-use Charged and
 * Concentrating flags, and current Exhaustion. Designed for fast scanning:
 * neutral axes recede, changes are emphasised; inactive flags vanish for the
 * public sheet.
 *
 * Owner-mode controls (UNN-226) live inline in each row so a player can flip
 * Concentrating or pick an ailment without breaking out of the tab they're
 * playing on. The header-right "Clear combat state" reset wipes Ailment +
 * Battle Conditions + flags in a single click; Exhaustion is dungeoneering
 * state and only Full Rest reduces it (UNN-156).
 */
export function CombatState() {
  const character = useCharacter()
  const conditions = character.battleConditions ?? DEFAULT_BATTLE_CONDITIONS
  const hasState =
    character.ailments.length > 0 ||
    conditions.attack !== "neutral" ||
    conditions.defense !== "neutral" ||
    conditions.hitEvasion !== "neutral" ||
    conditions.charged ||
    conditions.concentrating

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Combat State</CardTitle>
        <OwnerOnly>
          <ClearCombatStateButton hasState={hasState} />
        </OwnerOnly>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 items-start gap-x-2">
          <AilmentEditor />
          <Exhaustion />
        </div>
        <PrismaRow />
        <BattleConditionRow />
        <FlagRow />
        <PartyCompositionRow composition={character.partyComposition} />
      </CardContent>
    </Card>
  )
}
