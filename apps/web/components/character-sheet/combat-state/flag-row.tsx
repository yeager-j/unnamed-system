"use client"

import { DEFAULT_BATTLE_CONDITIONS } from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"
import { Toggle } from "@workspace/ui/components/toggle"

import { useViewerRole } from "@/components/shell/viewer-role"
import { useCharacter, useCharacterWrite } from "@/hooks/use-character"
import { setBattleConditionFlagAction } from "@/lib/actions/combat-state"
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
export function FlagRow() {
  const role = useViewerRole()
  const { charged, concentrating } =
    useCharacter().battleConditions ?? DEFAULT_BATTLE_CONDITIONS

  if (role !== "owner") {
    if (!charged && !concentrating) return null
    return (
      <div className="flex flex-wrap gap-2">
        {charged ? (
          <Badge variant="secondary">
            {BATTLE_CONDITION_FLAG_LABELS.charged}
          </Badge>
        ) : null}
        {concentrating ? (
          <Badge variant="secondary">
            {BATTLE_CONDITION_FLAG_LABELS.concentrating}
          </Badge>
        ) : null}
      </div>
    )
  }

  return <OwnerFlagRow charged={charged} concentrating={concentrating} />
}

function OwnerFlagRow({
  charged,
  concentrating,
}: {
  charged: boolean
  concentrating: boolean
}) {
  const { pending, write, characterId } = useCharacterWrite()
  const values: Record<FlagKey, boolean> = { charged, concentrating }

  function dispatch(flag: FlagKey, value: boolean) {
    write({
      edit: { kind: "battleConditionFlag", flag, value },
      surface: "battleConditions",
      action: (expectedVersion) =>
        setBattleConditionFlagAction({
          characterId,
          flag,
          value,
          expectedVersion,
        }),
    })
  }

  return (
    <div className="flex flex-wrap gap-2">
      {FLAGS.map(({ key, label }) => (
        <Toggle
          key={key}
          variant="outline"
          size="sm"
          pressed={values[key]}
          disabled={pending}
          onPressedChange={(next) => dispatch(key, next)}
        >
          {label}
        </Toggle>
      ))}
    </div>
  )
}
