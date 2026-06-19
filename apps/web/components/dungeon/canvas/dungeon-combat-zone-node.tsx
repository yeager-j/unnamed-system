"use client"

import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr"
import { NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react"

import {
  groupTokensByEngagement,
  type ZoneEnchantmentBadge,
  type ZoneToken,
} from "@workspace/game/engine"
import type { MapZone } from "@workspace/game/foundation"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { EnchantmentBadge } from "@/components/combat/enchantment-badge"
import { ZoneEnchantmentControl } from "@/components/combat/zone-enchantment-control"

import { useDungeonCombatCanvas } from "./dungeon-combat-canvas-context"
import { DungeonCombatTokenChip } from "./dungeon-combat-token-chip"
import { ZoneCardFrame } from "./zone-card-frame"

export type DungeonCombatZoneData = {
  zone: MapZone
  revealed: boolean
  tokens: ZoneToken[]
  /** Both sides stand here — the Zone reads **Engaged** (ticket / rulebook §3.5). */
  engaged: boolean
  /** The Zone's active Bard Enchantment, when the Instance's singleton sits here. */
  enchantment?: ZoneEnchantmentBadge
}
export type DungeonCombatZoneNode = Node<
  DungeonCombatZoneData,
  "dungeonCombatZone"
>

/**
 * A Zone on the **combat** battlefield (UNN-467) — the combat peer of the
 * exploration {@link import("./dungeon-zone-node").DungeonZoneNode}, built on the
 * shared {@link ZoneCardFrame} so the board reads identically across phases. It
 * renders the Zone's combatant tokens as side-tinted {@link DungeonCombatTokenChip}s
 * (the acting one ringed), groups tokens locked in melee inside a dotted square
 * ({@link groupTokensByEngagement}), flags **Engaged** when both sides occupy it,
 * carries the Bard {@link ZoneEnchantmentControl} (with the active
 * {@link EnchantmentBadge}), and — while a combatant is acting and this Zone is a
 * legal move target — surfaces a floating "Move {actor} here" action (click-to-move;
 * guided-but-overridable). Tapping a token opens the detail drawer. All dispatchers
 * come from {@link useDungeonCombatCanvas}.
 */
export function DungeonCombatZoneNode({
  data,
}: NodeProps<DungeonCombatZoneNode>) {
  const {
    actingCombatantId,
    actingName,
    movableZoneIds,
    onMoveActing,
    onSelectCombatant,
    onCombatEvent,
    disabled,
  } = useDungeonCombatCanvas()
  const { zone, revealed, tokens, engaged, enchantment } = data
  const isMoveTarget = movableZoneIds.includes(zone.id)
  const showMove = isMoveTarget && actingName !== null

  const tokenChip = (token: ZoneToken) => (
    <button
      type="button"
      onClick={() => onSelectCombatant(token.id)}
      aria-label={`${token.name} details`}
      className="cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      <DungeonCombatTokenChip
        token={token}
        acting={token.id === actingCombatantId}
      />
    </button>
  )

  return (
    <ZoneCardFrame
      name={zone.name}
      revealed={revealed}
      count={tokens.length}
      ariaLabel={`Zone: ${zone.name}${engaged ? " (engaged)" : ""}`}
      className={cn(
        "transition-shadow",
        isMoveTarget &&
          "ring-2 ring-primary/40 ring-offset-1 ring-offset-background"
      )}
      titleAccessory={
        enchantment ? <EnchantmentBadge enchantment={enchantment} /> : null
      }
      action={
        <>
          <ZoneEnchantmentControl
            zoneId={zone.id}
            zoneName={zone.name}
            enchantment={enchantment}
            onCombatEvent={onCombatEvent}
            disabled={disabled}
          />
        </>
      }
      toolbar={
        showMove ? (
          <NodeToolbar
            isVisible
            position={Position.Bottom}
            className="rounded-none border bg-popover p-1 shadow-md"
          >
            <Button
              size="sm"
              disabled={disabled}
              onClick={() => onMoveActing(zone.id)}
            >
              <ArrowRightIcon weight="bold" />
              Move {actingName} here
            </Button>
          </NodeToolbar>
        ) : undefined
      }
    >
      {groupTokensByEngagement(tokens).map((group) =>
        group.length > 1 ? (
          <li key={group.map((token) => token.id).join("|")}>
            <div
              role="group"
              aria-label={`Engaged: ${group.map((token) => token.name).join(", ")}`}
              className="flex flex-wrap gap-1.5 border border-dotted border-destructive/60 p-1"
            >
              {group.map((token) => (
                <div key={token.id}>{tokenChip(token)}</div>
              ))}
            </div>
          </li>
        ) : (
          <li key={group[0]!.id}>{tokenChip(group[0]!)}</li>
        )
      )}
    </ZoneCardFrame>
  )
}
