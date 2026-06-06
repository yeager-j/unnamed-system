"use client"

import { ArrowRightIcon } from "@phosphor-icons/react"
import Link from "next/link"
import { useTransition } from "react"
import { toast } from "sonner"

import {
  ARCHETYPE_RANKS_PER_LEVEL,
  computeMaxHitDice,
  computeMaxSkillDice,
  getPathStats,
  VICTORIES_PER_LEVEL,
  type HydratedCharacter,
} from "@workspace/game/character"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"

import { broadcastCharacterVersion } from "@/hooks/use-character-versions-broadcast"
import { levelUpAction } from "@/lib/actions/leveling"

/**
 * The header-launched level-up dialog (PRD §7.4, UNN-157). Single-pane
 * confirmation: the app never rolls and MVP uses averaged Hit/Skill Dice (see
 * the engine comment in `lib/game/character/leveling.ts`), so there is no
 * player input — the dialog summarizes the deterministic state change and
 * asks the player to confirm.
 *
 * Cross-class write: `applyLevelUpForCharacter` touches both `progressionVersion`
 * and `vitalsVersion`. `dispatchCharacterWriteWithRetry` is single-class and
 * does not compose, so this dispatch is bespoke. On success we broadcast both
 * classes so any sibling tab refreshes. On `"stale"` we toast and leave the
 * dialog open — level-up is rare and an automatic retry can mask a real
 * conflict.
 *
 * Saved Archetype Ranks land in the counter; this dialog deliberately does
 * not advance any Archetype Rank inline (handed off to the Archetype
 * Management surface). A footer link points the player at the Archetypes tab.
 */
export function LevelUpDialog({
  character,
  open,
  onOpenChange,
}: {
  character: HydratedCharacter
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const [pending, startTransition] = useTransition()

  const nextLevel = character.level + 1
  const pathStats = getPathStats(character.pathChoice)
  const nextMaxHP = character.maxHP + pathStats.hpPerLevel
  const nextMaxSP = character.maxSP + pathStats.spPerLevel
  const nextMaxHitDice = computeMaxHitDice(nextLevel)
  const nextMaxSkillDice = computeMaxSkillDice(nextLevel)
  const nextVictories = character.victories - VICTORIES_PER_LEVEL
  const nextSavedRanks =
    character.savedArchetypeRanks + ARCHETYPE_RANKS_PER_LEVEL

  function handleConfirm() {
    startTransition(async () => {
      const result = await levelUpAction({
        characterId: character.id,
        expectedVersions: {
          progression: character.progressionVersion,
          vitals: character.vitalsVersion,
        },
      })

      if (result.ok) {
        broadcastCharacterVersion(character.id, ["progression", "vitals"])
        onOpenChange(false)
        toast.success(`Leveled up to Level ${nextLevel}.`)
        return
      }

      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else if (result.error === "insufficient-victories") {
        toast.error(
          `Need at least ${VICTORIES_PER_LEVEL} Victories to level up.`
        )
      } else if (result.error === "max-level") {
        toast.error("Already at maximum level.")
      } else {
        toast.error("Couldn't save. Try again.")
      }
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Level up to Level {nextLevel}</DialogTitle>
          <DialogDescription>
            Spend {VICTORIES_PER_LEVEL} Victories to gain a level. Hit and Skill
            Dice refill to the new max, and you bank 2 Archetype Ranks to spend
            later.
          </DialogDescription>
        </DialogHeader>

        <dl className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-2 border border-border bg-muted/30 p-3 text-sm">
          <Change label="Level" before={character.level} after={nextLevel} />
          <Change label="Max HP" before={character.maxHP} after={nextMaxHP} />
          <Change label="Max SP" before={character.maxSP} after={nextMaxSP} />
          <Change
            label="Hit Dice"
            before={`${character.hitDiceRemaining} / ${character.maxHitDice}`}
            after={`${nextMaxHitDice} / ${nextMaxHitDice}`}
          />
          <Change
            label="Skill Dice"
            before={`${character.skillDiceRemaining} / ${character.maxSkillDice}`}
            after={`${nextMaxSkillDice} / ${nextMaxSkillDice}`}
          />
          <Change
            label="Saved Archetype Ranks"
            before={character.savedArchetypeRanks}
            after={nextSavedRanks}
          />
          <Change
            label="Victories"
            before={character.victories}
            after={nextVictories}
            note={nextVictories > 0 ? "carryover" : undefined}
          />
        </dl>

        <p className="text-xs/relaxed text-muted-foreground">
          You banked {ARCHETYPE_RANKS_PER_LEVEL} Archetype Ranks.{" "}
          <Link
            href="?tab=archetypes"
            className="inline-flex items-center gap-0.5 underline underline-offset-2 hover:text-foreground"
            onClick={() => onOpenChange(false)}
          >
            Spend them on the Archetypes tab
            <ArrowRightIcon weight="bold" aria-hidden />
          </Link>
          .
        </p>

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={pending}
          >
            Cancel
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={pending}>
            Confirm level-up
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}

function Change({
  label,
  before,
  after,
  note,
}: {
  label: string
  before: number | string
  after: number | string
  note?: string
}) {
  return (
    <>
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="flex items-center gap-2 font-medium tabular-nums">
        <span className="text-muted-foreground">{before}</span>
        <ArrowRightIcon
          weight="bold"
          aria-hidden
          className="text-muted-foreground"
        />
        <span>{after}</span>
        {note ? (
          <span className="text-xs font-normal text-muted-foreground">
            ({note})
          </span>
        ) : null}
      </dd>
    </>
  )
}
