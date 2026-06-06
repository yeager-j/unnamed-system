"use client"

import {
  ArrowsOutCardinalIcon,
  ArrowUUpLeftIcon,
  SwordIcon,
} from "@phosphor-icons/react/dist/ssr"
import type { ReactNode } from "react"

import type {
  ActionEconomyAction,
  CombatantDetail,
  CombatEvent,
} from "@workspace/game/encounter"
import { Toggle } from "@workspace/ui/components/toggle"

import { DetailSection } from "@/components/shared/detail-section"
import { ACTION_ECONOMY_LABELS } from "@/lib/ui/labels"

/**
 * The drawer's **ACTIONS THIS TURN** section (UNN-310) — the three per-turn
 * action toggles (Move / Standard / Reaction). Each is **non-enforcing**: it
 * never blocks acting (ADR Decision 8), it is a tracking aid the DM eyeballs. A
 * pressed toggle = still available; the whole set refreshes at the start of a
 * normal turn via `draftCombatant`. Identical for PCs and enemies (overlay state).
 */
export function CombatantActionsSection({
  detail,
  onCombatEvent,
}: {
  detail: CombatantDetail
  onCombatEvent: (event: CombatEvent) => void
}) {
  const { actionEconomy } = detail

  function set(action: ActionEconomyAction, available: boolean) {
    onCombatEvent({
      kind: "setActionEconomy",
      combatantId: detail.id,
      action,
      available,
    })
  }

  return (
    <DetailSection title="Actions this turn">
      <div className="flex flex-wrap gap-2">
        <ActionToggle
          action="move"
          available={actionEconomy.move}
          icon={<ArrowsOutCardinalIcon aria-hidden />}
          onToggle={(available) => set("move", available)}
        />
        <ActionToggle
          action="standard"
          available={actionEconomy.standard}
          icon={<SwordIcon aria-hidden />}
          onToggle={(available) => set("standard", available)}
        />
        <ActionToggle
          action="reaction"
          available={actionEconomy.reaction}
          icon={<ArrowUUpLeftIcon aria-hidden />}
          onToggle={(available) => set("reaction", available)}
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
