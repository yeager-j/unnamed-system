"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import {
  Field,
  FieldContent,
  FieldDescription,
  FieldLabel,
  FieldLegend,
  FieldSet,
} from "@workspace/ui/components/field"
import {
  RadioGroup,
  RadioGroupItem,
} from "@workspace/ui/components/radio-group"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import { updateCharacterPathAction } from "@/lib/actions/character-path"
import { PATH_CHOICES, type PathChoice } from "@/lib/game/character"
import { getPathStats } from "@/lib/game/stats"
import { PATH_CHOICE_LABELS } from "@/lib/ui/labels"

/**
 * Per-path presentation copy that the engine itself doesn't own — the
 * die pair and the badge color variant for the label chip. Starting HP / SP
 * come from {@link getPathStats}, the single source of truth.
 */
const PATH_DISPLAY: Record<
  PathChoice,
  { hitDie: string; skillDie: string; badge: "hp" | "outline" | "sp" }
> = {
  "health-focused": { hitDie: "d12", skillDie: "d8", badge: "hp" },
  balanced: { hitDie: "d10", skillDie: "d10", badge: "outline" },
  "skill-focused": { hitDie: "d8", skillDie: "d12", badge: "sp" },
}

/**
 * The HP/SP path picker. Radio cards — the option list *is* the picker, no
 * separate legend or combobox. Built on the shadcn Field + RadioGroup
 * primitives, so the selected option carries the standard primary-tinted
 * `FieldLabel` highlight from the shared primitive.
 *
 * Path defaults to `"balanced"` on draft creation so the player always sees a
 * concrete HP/SP preview the moment they reach this step; switching to a
 * different path persists immediately via the shared dispatch pipeline.
 */
export function PathPicker({
  characterId,
  pathChoice,
  identityVersion,
}: {
  characterId: string
  pathChoice: PathChoice
  identityVersion: number
}) {
  const [, startTransition] = useTransition()
  const versionRef = useCharacterTokenRef(identityVersion)
  const [optimisticPath, setOptimisticPath] = useOptimistic(
    pathChoice,
    (_current: PathChoice, next: PathChoice) => next
  )

  function handleChange(next: PathChoice) {
    if (next === optimisticPath) return
    startTransition(async () => {
      setOptimisticPath(next)
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "identity",
        versionRef,
        action: (expectedVersion) =>
          updateCharacterPathAction({
            characterId,
            pathChoice: next,
            expectedVersion,
          }),
      })
      if (!result.ok) {
        if (result.error === "stale") {
          toast.error(
            "Someone else updated this character — refresh to see the latest."
          )
        } else if (result.error === "character-not-found") {
          toast.error("This character was deleted.")
        } else {
          toast.error("Couldn't save your path. Try again.")
        }
      }
    })
  }

  return (
    <FieldSet>
      <FieldLegend>Path</FieldLegend>
      <FieldDescription>
        Determines your starting HP / SP and the Hit / Skill Die you roll at
        level-up.
      </FieldDescription>
      <RadioGroup
        value={optimisticPath}
        onValueChange={(value) => handleChange(value as PathChoice)}
      >
        {PATH_CHOICES.map((choice) => {
          const stats = getPathStats(choice)
          const display = PATH_DISPLAY[choice]
          const id = `path-${choice}`
          return (
            <FieldLabel key={choice} htmlFor={id}>
              <Field orientation="horizontal">
                <FieldContent>
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <Badge variant={display.badge}>
                      {PATH_CHOICE_LABELS[choice]}
                    </Badge>
                    <span className="text-xs text-muted-foreground tabular-nums">
                      {display.hitDie} Hit / {display.skillDie} Skill
                    </span>
                  </div>
                  <FieldDescription>
                    Starts with {stats.startHP} HP · {stats.startSP} SP.
                  </FieldDescription>
                </FieldContent>
                <RadioGroupItem id={id} value={choice} />
              </Field>
            </FieldLabel>
          )
        })}
      </RadioGroup>
    </FieldSet>
  )
}
