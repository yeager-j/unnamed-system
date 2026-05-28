"use client"

import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { Badge } from "@workspace/ui/components/badge"
import { Toggle } from "@workspace/ui/components/toggle"

import { useViewerRole } from "@/components/shell/viewer-role"
import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import { setBattleConditionFlagAction } from "@/lib/actions/combat-state"
import type { BattleConditions } from "@/lib/game/character"
import { BATTLE_CONDITION_FLAG_LABELS } from "@/lib/ui/labels"

type FlagKey = "charged" | "concentrating"

const FLAGS: readonly { key: FlagKey; label: string }[] = [
  { key: "charged", label: BATTLE_CONDITION_FLAG_LABELS.charged },
  {
    key: "concentrating",
    label: BATTLE_CONDITION_FLAG_LABELS.concentrating,
  },
]

/**
 * The Charged / Concentrating flag row on the Combat State card. Public mode
 * keeps the at-a-glance behavior — the row hides when both flags are false
 * so neutral state doesn't add visual noise. Owner mode (UNN-226) always
 * renders both as `Toggle`s so a single click sets or clears either flag,
 * which is what makes the row useful during play.
 */
export function FlagRow({
  characterId,
  conditions,
  vitalsVersion,
}: {
  characterId: string
  conditions: BattleConditions
  vitalsVersion: number
}) {
  const role = useViewerRole()
  if (role !== "owner") {
    if (!conditions.charged && !conditions.concentrating) return null
    return (
      <div className="flex flex-wrap gap-2">
        {conditions.charged ? (
          <Badge variant="secondary">
            {BATTLE_CONDITION_FLAG_LABELS.charged}
          </Badge>
        ) : null}
        {conditions.concentrating ? (
          <Badge variant="secondary">
            {BATTLE_CONDITION_FLAG_LABELS.concentrating}
          </Badge>
        ) : null}
      </div>
    )
  }

  return (
    <OwnerFlagRow
      characterId={characterId}
      conditions={conditions}
      vitalsVersion={vitalsVersion}
    />
  )
}

type FlagPatch = { key: FlagKey; value: boolean }

function OwnerFlagRow({
  characterId,
  conditions,
  vitalsVersion,
}: {
  characterId: string
  conditions: BattleConditions
  vitalsVersion: number
}) {
  const versionRef = useCharacterTokenRef(vitalsVersion)
  const [pending, startTransition] = useTransition()
  // Reducer-as-merger so back-to-back toggles compose correctly: applying a
  // patch always builds on the *current* optimistic state, not on a closure-
  // captured value that can lag behind a still-settling prior transition.
  const [optimistic, applyOptimistic] = useOptimistic(
    conditions,
    (current, patch: FlagPatch): BattleConditions => ({
      ...current,
      [patch.key]: patch.value,
    })
  )

  function dispatch(key: FlagKey, value: boolean) {
    startTransition(async () => {
      applyOptimistic({ key, value })
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "vitals",
        versionRef,
        action: (expectedVersion) =>
          setBattleConditionFlagAction({
            characterId,
            flag: key,
            value,
            expectedVersion,
          }),
      })
      if (result.ok) return
      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else {
        toast.error("Couldn't save. Try again.")
      }
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {FLAGS.map(({ key, label }) => (
        <Toggle
          key={key}
          variant="outline"
          size="sm"
          pressed={optimistic[key]}
          disabled={pending}
          onPressedChange={(next) => dispatch(key, next)}
        >
          {label}
        </Toggle>
      ))}
    </div>
  )
}
