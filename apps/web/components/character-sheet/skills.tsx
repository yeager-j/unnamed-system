import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { ItemGroup } from "@workspace/ui/components/item"

import type { HydratedCharacter } from "@/lib/game/hydrated-character"
import { getEquippedWeapon } from "@/lib/game/items"

import { IntrinsicAttackRow, SkillRow } from "./skill-row"

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
  const equippedWeapon = getEquippedWeapon(character.inventory)

  const sorted = [...character.skills].sort((a, b) =>
    a.name.localeCompare(b.name)
  )
  const regular = sorted.filter((entry) => !entry.isSynthesis)
  const synthesis = sorted.filter((entry) => entry.isSynthesis)

  return (
    <div className="flex flex-col gap-4">
      {equippedWeapon ? (
        <Card>
          <CardHeader>
            <CardTitle>Weapon Attack</CardTitle>
          </CardHeader>
          <CardContent>
            <IntrinsicAttackRow weapon={equippedWeapon} />
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
                <SkillRow key={entry.key} skill={entry} />
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
                <SkillRow key={entry.key} skill={entry} />
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
