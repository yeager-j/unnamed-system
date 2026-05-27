"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { ItemGroup } from "@workspace/ui/components/item"

import { IntrinsicAttackRow, SkillRow } from "@/components/shared/skill-row"
import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import { castSkillAction } from "@/lib/actions/cast-skill"
import type { HydratedCharacter } from "@/lib/game/character"
import { getEquippedItem } from "@/lib/game/items"
import { applyResolvedCost, sortSkillsByKind } from "@/lib/game/skills"

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
export function Skills({ character }: { character: HydratedCharacter }) {
  const equippedWeapon = getEquippedItem(character.inventory, "weapon")
  const { attributes, weaponAttackRoll } = character

  const sorted = sortSkillsByKind(character.skills)
  const regular = sorted.filter((entry) => !entry.isSynthesis)
  const synthesis = sorted.filter((entry) => entry.isSynthesis)

  const [pending, startTransition] = useTransition()
  // Vitals-class token (UNN-140). A rapid follow-up Cast reads the value
  // just written by the prior save's success branch — without waiting for
  // React commit + effect to propagate the new prop.
  const versionRef = useCharacterTokenRef(character.vitalsVersion)

  const [pools, applyOptimistic] = useOptimistic(
    { currentHP: character.currentHP, currentSP: character.currentSP },
    (current, skillKey: string) => {
      // Route the optimistic frame through the same `applyResolvedCost`
      // primitive the Server Action runs (UNN-231) — keeps the optimistic
      // pool deduction structurally identical to the persisted one. The
      // disabled Cast button means an unaffordable cast cannot dispatch,
      // so we treat the err branch as a no-op.
      const skill = character.skills.find((entry) => entry.key === skillKey)
      const cost = skill?.resolvedCost
      if (!cost) return current
      const result = applyResolvedCost(cost, current)
      return result.ok ? result.value : current
    }
  )

  function handleCast(skillKey: string) {
    startTransition(async () => {
      applyOptimistic(skillKey)
      const result = await dispatchCharacterWriteWithRetry({
        characterId: character.id,
        characterClass: "vitals",
        versionRef,
        action: (expectedVersion) =>
          castSkillAction({
            characterId: character.id,
            skillKey,
            expectedVersion,
          }),
      })

      if (result.ok) return

      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else {
        toast.error("Couldn't cast Skill. Try again.")
      }
    })
  }

  const cast = {
    currentHP: pools.currentHP,
    currentSP: pools.currentSP,
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
