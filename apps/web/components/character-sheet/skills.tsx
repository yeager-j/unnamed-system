import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { ItemGroup } from "@workspace/ui/components/item"

import { IntrinsicAttackRow, SkillRow } from "@/components/shared/skill-row"
import type { HydratedCharacter } from "@/lib/game/character"
import { getEquippedItem } from "@/lib/game/items"
import { sortSkillsByKind } from "@/lib/game/skills"

/**
 * The Combat-tab Skills surface (PRD §6.1): every Skill currently available
 * to the character — granted by the active Archetype's unlocked Ranks, its
 * Inheritance Slots, the equipped weapon's intrinsic attack, or any
 * equipment-granted Skill — plus the active Archetype's Synthesis Skill in
 * its own subsection. Read-only; the cast button is a later ticket.
 *
 * Each row opens a {@link SkillCard} popover on click/tap with the full
 * rulebook detail.
 */
export function Skills({ character }: { character: HydratedCharacter }) {
  const equippedWeapon = getEquippedItem(character.inventory, "weapon")
  const { attributes, weaponAttackRoll } = character

  const sorted = sortSkillsByKind(character.skills)
  const regular = sorted.filter((entry) => !entry.isSynthesis)
  const synthesis = sorted.filter((entry) => entry.isSynthesis)

  return (
    <div className="flex flex-col gap-4">
      {equippedWeapon && weaponAttackRoll ? (
        <Card>
          <CardHeader>
            <CardTitle>Weapon Attack</CardTitle>
          </CardHeader>
          <CardContent>
            <IntrinsicAttackRow
              weapon={equippedWeapon}
              attributes={attributes}
              weaponAttackRoll={weaponAttackRoll}
            />
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle>Skills</CardTitle>
        </CardHeader>
        <CardContent>
          {regular.length > 0 ? (
            <ItemGroup className="gap-0">
              {regular.map((entry) => (
                <SkillRow
                  key={entry.key}
                  skill={entry}
                  attributes={attributes}
                />
              ))}
            </ItemGroup>
          ) : (
            <EmptyState message="No Skills available. Set an active Archetype to populate this list." />
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Synthesis Skills</CardTitle>
        </CardHeader>
        <CardContent>
          {synthesis.length > 0 ? (
            <ItemGroup className="gap-0">
              {synthesis.map((entry) => (
                <SkillRow
                  key={entry.key}
                  skill={entry}
                  attributes={attributes}
                />
              ))}
            </ItemGroup>
          ) : (
            <EmptyState message="No Synthesis Skill yet — reach the required Rank on your active Archetype to unlock it." />
          )}
        </CardContent>
      </Card>
    </div>
  )
}

function EmptyState({ message }: { message: string }) {
  return <p className="text-sm text-muted-foreground">{message}</p>
}
