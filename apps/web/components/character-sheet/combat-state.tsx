import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"

import { OwnerOnly } from "@/components/shell/viewer-role"
import {
  DEFAULT_BATTLE_CONDITIONS,
  type HydratedCharacter,
} from "@/lib/game/character"

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
 *
 * Battle Condition `stacks` are not displayed: rulebook 3.8 forbids
 * constructive stacking, so `stacks > 1` only encodes extended duration —
 * meaningful once an initiative tracker exists, not before.
 */
export function CombatState({ character }: { character: HydratedCharacter }) {
  const conditions = character.battleConditions ?? DEFAULT_BATTLE_CONDITIONS

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between gap-2">
        <CardTitle>Combat State</CardTitle>
        <OwnerOnly>
          <ClearCombatStateButton
            characterId={character.id}
            vitalsVersion={character.vitalsVersion}
            hasState={
              character.ailments.length > 0 ||
              conditions.attack.state !== "neutral" ||
              conditions.defense.state !== "neutral" ||
              conditions.hitEvasion.state !== "neutral" ||
              conditions.charged ||
              conditions.concentrating
            }
          />
        </OwnerOnly>
      </CardHeader>
      <CardContent className="flex flex-col gap-4">
        <div className="grid grid-cols-3 items-start gap-x-2">
          <AilmentEditor
            characterId={character.id}
            ailments={character.ailments}
            vitalsVersion={character.vitalsVersion}
          />
          <Exhaustion
            characterId={character.id}
            exhaustion={character.exhaustion}
            vitalsVersion={character.vitalsVersion}
          />
        </div>
        <PrismaRow
          characterId={character.id}
          prismaCharges={character.prismaCharges}
          vitalsVersion={character.vitalsVersion}
        />
        <BattleConditionRow
          characterId={character.id}
          conditions={conditions}
          vitalsVersion={character.vitalsVersion}
        />
        <FlagRow
          characterId={character.id}
          conditions={conditions}
          vitalsVersion={character.vitalsVersion}
        />
        <PartyCompositionRow composition={character.partyComposition} />
      </CardContent>
    </Card>
  )
}
