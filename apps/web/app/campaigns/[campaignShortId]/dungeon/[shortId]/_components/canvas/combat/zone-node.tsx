"use client"

import { ArrowRightIcon } from "@phosphor-icons/react/dist/ssr"
import { NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"
import type { MapZone } from "@workspace/game-v2/spatial"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { DungeonCombatTokenChip } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/combat/token-chip"
import { EngagedCluster } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/watch/engaged-cluster"
import { ZoneCardFrame } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/zone-card-frame"
import { ZoneEnchantmentControl } from "@/components/combat/controls/zone-enchantment"
import { EnchantmentBadge } from "@/components/shared/enchantment-badge"
import type { Pool } from "@/domain/combat/view/pool"
import type { ZoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"

import { useDungeonCombatCanvas } from "./context"

/** One combatant on the combat board — the display subset of a `RailRow`.
 *  `portraitUrl` is the uploaded token art or `null` (the chip's glyph falls
 *  back to initials). */
export interface DungeonCombatToken {
  id: ParticipantId
  name: string
  side: CombatSide
  portraitUrl: string | null
  hp: Pool | null
  sp: Pool | null
  /** Locked in melee here (any survivor engagement) — draws the dimmed sword. */
  engaged: boolean
}

export type DungeonCombatZoneData = {
  zone: MapZone
  revealed: boolean
  tokens: DungeonCombatToken[]
  /** Both sides stand here — the Zone reads **Engaged** (rulebook §3.5). */
  engaged: boolean
  /** The Zone's active Bard Enchantment, when the Instance's singleton sits here. */
  enchantment?: ZoneEnchantmentBadge
}
export type DungeonCombatZoneNode = Node<
  DungeonCombatZoneData,
  "dungeonCombatZone"
>

/**
 * A Zone on the **combat** battlefield (UNN-536) — the combat peer of the
 * exploration {@link import("@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/zone-node").DungeonZoneNode},
 * built on the shared {@link ZoneCardFrame} so the board reads identically across
 * phases. It renders the Zone's combatant tokens as side-tinted
 * {@link DungeonCombatTokenChip}s (the acting one ringed), rings the melee-locked
 * tokens in a dashed **Engaged** cluster, carries the Bard
 * {@link ZoneEnchantmentControl}, and — while a combatant is acting and this Zone
 * is a legal move target — surfaces a floating "Move {actor} here" action
 * (click-to-move; guided-but-overridable). Tapping a token opens the detail
 * drawer. All dispatchers come from {@link useDungeonCombatCanvas}.
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

  const engagedTokens = tokens.filter((token) => token.engaged)
  const looseTokens = tokens.filter((token) => !token.engaged)

  const tokenChip = (token: DungeonCombatToken) => (
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
        <ZoneEnchantmentControl
          zoneId={zone.id}
          zoneName={zone.name}
          enchantment={enchantment}
          onCombatEvent={onCombatEvent}
          disabled={disabled}
        />
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
      {engagedTokens.length > 1 ? (
        <li>
          <EngagedCluster
            label={`Engaged: ${engagedTokens
              .map((token) => token.name)
              .join(", ")}`}
          >
            {engagedTokens.map((token) => (
              <div key={token.id}>{tokenChip(token)}</div>
            ))}
          </EngagedCluster>
        </li>
      ) : (
        engagedTokens.map((token) => <li key={token.id}>{tokenChip(token)}</li>)
      )}
      {looseTokens.map((token) => (
        <li key={token.id}>{tokenChip(token)}</li>
      ))}
    </ZoneCardFrame>
  )
}
