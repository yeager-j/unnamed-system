"use client"

import {
  ArrowRightIcon,
  EyeSlashIcon,
  SwordIcon,
} from "@phosphor-icons/react/dist/ssr"
import { NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react"

import type { ZoneToken } from "@workspace/game/engine"
import type { MapZone } from "@workspace/game/foundation"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import { useDungeonCombatCanvas } from "./dungeon-combat-canvas-context"
import { DungeonCombatTokenChip } from "./dungeon-combat-token-chip"
import { FloatingEdgeHandles } from "./floating-edge-handles"

export type DungeonCombatZoneData = {
  zone: MapZone
  revealed: boolean
  tokens: ZoneToken[]
  /** Both sides stand here — the Zone reads **Engaged** (ticket / rulebook §3.5). */
  engaged: boolean
}
export type DungeonCombatZoneNode = Node<
  DungeonCombatZoneData,
  "dungeonCombatZone"
>

/**
 * A Zone on the **combat** battlefield (UNN-467) — the combat peer of the
 * exploration {@link import("./dungeon-zone-node").DungeonZoneNode}, built on the
 * same {@link Card} so the board reads identically across phases. It renders the
 * Zone's combatant tokens as side-tinted {@link DungeonCombatTokenChip}s (the
 * acting one ringed), flags **Engaged** when both sides occupy it, and — while a
 * combatant is acting and this Zone is a legal move target — surfaces a floating
 * "Move {actor} here" action (click-to-move; guided-but-overridable). Tapping a
 * token opens the detail drawer. All dispatchers come from
 * {@link useDungeonCombatCanvas}.
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
    disabled,
  } = useDungeonCombatCanvas()
  const { zone, revealed, tokens, engaged } = data
  const isMoveTarget = movableZoneIds.includes(zone.id)
  const showMove = isMoveTarget && actingName !== null

  return (
    <>
      {showMove ? (
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
      ) : null}

      <FloatingEdgeHandles />

      <Card
        size="sm"
        aria-label={`Zone: ${zone.name}${engaged ? " (engaged)" : ""}`}
        className={cn(
          "min-h-48 w-86 shadow-sm transition-shadow",
          !revealed && "bg-muted/40",
          movableZoneIds.includes(zone.id) &&
            "ring-2 ring-primary/40 ring-offset-1 ring-offset-background"
        )}
      >
        <CardHeader>
          <CardTitle
            className={cn(
              "flex items-center gap-1.5 text-base",
              !revealed && "text-muted-foreground"
            )}
          >
            {!revealed && (
              <EyeSlashIcon
                className="size-4 shrink-0"
                aria-label="Hidden from players"
              />
            )}
            <span className="truncate">{zone.name}</span>
          </CardTitle>
          <CardAction className="flex items-center gap-1.5">
            {engaged ? (
              <Badge variant="destructive" className="gap-1">
                <SwordIcon weight="fill" className="size-3" />
                Engaged
              </Badge>
            ) : null}
            <span className="text-xs text-muted-foreground tabular-nums">
              {tokens.length}
            </span>
          </CardAction>
        </CardHeader>

        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-xs text-muted-foreground">Empty</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {tokens.map((token) => (
                <li key={token.id}>
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
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
