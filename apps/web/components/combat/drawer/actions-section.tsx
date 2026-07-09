"use client"

import {
  ArrowsOutCardinalIcon,
  ArrowUUpLeftIcon,
  SwordIcon,
} from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"

import type {
  ActionAvailability,
  ActionEconomyAction,
  ActionEconomyEvent,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { Toggle } from "@workspace/ui/components/toggle"

import { DetailSection } from "@/components/shared/detail-section"
import { ACTION_ECONOMY_LABELS } from "@/lib/ui/labels"

/**
 * The drawer's **ACTIONS THIS TURN** section (UNN-310, on v2's consumption
 * model) — the three per-turn action toggles (Move / Standard / Reaction).
 * Non-enforcing: a tracking aid the DM eyeballs; drafting resets consumption.
 * v2 stores *used counts*, so a toggle-off dispatches `adjustActionEconomy`
 * with `delta: +1` (consume) and a toggle-on `delta: -1` (restore) — the
 * delta merges against the loaded session instead of overwriting (the UNN-226
 * lesson). The advisory availability the toggle renders is the selector's
 * `available = max(0, 1 − used)`.
 */
export function CombatantActionsSection({
  participantId,
  availability,
  onCombatEvent,
}: {
  participantId: ParticipantId
  availability: ActionAvailability
  onCombatEvent: (event: ActionEconomyEvent) => void
}) {
  function adjust(action: ActionEconomyAction, available: boolean) {
    onCombatEvent({
      kind: "adjustActionEconomy",
      participantId,
      action,
      delta: available ? -1 : 1,
    })
  }

  return (
    <DetailSection title="Actions this turn">
      <div className="flex flex-wrap gap-2">
        <ActionToggle
          action="move"
          available={availability.move > 0}
          icon={<ArrowsOutCardinalIcon aria-hidden />}
          onToggle={(available) => adjust("move", available)}
        />
        <ActionToggle
          action="standard"
          available={availability.standard > 0}
          icon={<SwordIcon aria-hidden />}
          onToggle={(available) => adjust("standard", available)}
        />
        <ActionToggle
          action="reaction"
          available={availability.reaction > 0}
          icon={<ArrowUUpLeftIcon aria-hidden />}
          onToggle={(available) => adjust("reaction", available)}
        />
      </div>
    </DetailSection>
  )
}

/** One action chip — pressed = available, unpressed = spent (struck through). */
function ActionToggle({
  action,
  available,
  icon,
  onToggle,
}: {
  action: ActionEconomyAction
  available: boolean
  icon: ReactNode
  onToggle: (available: boolean) => void
}) {
  const label = ACTION_ECONOMY_LABELS[action]
  return (
    <Toggle
      pressed={available}
      onPressedChange={onToggle}
      variant="outline"
      size="sm"
      aria-label={`${label} ${available ? "available" : "used"}`}
      className="gap-1.5 data-[pressed]:border-foreground"
    >
      {icon}
      <span className={available ? "" : "text-muted-foreground line-through"}>
        {label}
      </span>
    </Toggle>
  )
}
