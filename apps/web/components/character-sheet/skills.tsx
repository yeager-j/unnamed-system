"use client"

import { getEquippedItem, sortSkillsByKind } from "@workspace/game/engine"
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { ItemGroup } from "@workspace/ui/components/item"

import { IntrinsicAttackRow, SkillRow } from "@/components/shared/skill-row"
import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import { castSkillAction } from "@/lib/actions/cast-skill"

/**
 * The Combat-tab Skills surface (PRD §6.1 / §7.2): every Skill currently
 * available to the character — granted by the active Archetype's unlocked
 * Ranks, its Inheritance Slots, the equipped weapon's intrinsic attack, or
 * any equipment-granted Skill — plus the active Archetype's Synthesis Skill
 * in its own subsection.
 *
 * **Owner mode (UNN-225).** Each row gains a Cast button: the SkillCard
 * popover always shows the full-size affordance; on `md+` viewports an
 * inline echo lives in the row's actions slot. Cast deducts the resolved
 * cost from current SP / HP via the pure `applyCast` engine — the same
 * function the Server Action runs — so the optimistic frame is structurally
 * identical to the persisted one. After the server returns,
 * `revalidateCharacter` re-derives the Vitals card automatically. Read-only
 * callers (public sheet, signed-out viewers) do not see Cast at all because
 * the `cast` prop short-circuits inside {@link OwnerOnly}.
 */
export function Skills() {
  const character = useCharacter()
  const { pending, write, characterId } = useCharacterWrite()

  const equippedWeapon = getEquippedItem(character.inventory, "weapon")
  const { attributes, weaponAttackRoll, weaponDamageBonuses } = character

  const sorted = sortSkillsByKind(character.skills)
  const regular = sorted.filter((entry) => !entry.isSynthesis)
  const synthesis = sorted.filter((entry) => entry.isSynthesis)

  function handleCast(skillKey: string) {
    write({
      edit: { kind: "cast", skillKey },
      surface: "cast",
      action: (expectedVersion) =>
        castSkillAction({ characterId, skillKey, expectedVersion }),
      messages: { error: "Couldn't cast Skill. Try again." },
    })
  }

  const cast = {
    currentHP: character.currentHP,
    currentSP: character.currentSP,
    pending,
    onCast: handleCast,
  }

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
              weaponDamageBonuses={weaponDamageBonuses}
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
                  cast={cast}
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
                  cast={cast}
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
