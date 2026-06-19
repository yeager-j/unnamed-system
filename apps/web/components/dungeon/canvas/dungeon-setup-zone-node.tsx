"use client"

import {
  CheckCircleIcon,
  CircleDashedIcon,
} from "@phosphor-icons/react/dist/ssr"
import { type Node, type NodeProps } from "@xyflow/react"
import Image from "next/image"

import type { MapZone } from "@workspace/game/foundation"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

import { initials } from "@/lib/ui/initials"

import { useDungeonSetupCanvas } from "./dungeon-setup-canvas-context"
import { FloatingEdgeHandles } from "./floating-edge-handles"

export interface DungeonSetupZoneToken {
  /** The PC's `characterId`, or a staged enemy's display key. */
  id: string
  name: string
  portraitUrl: string | null
  side: "players" | "enemies"
  isPc: boolean
  /** In the staged fight — PCs toggle this; staged enemies are always in. */
  included: boolean
}
export type DungeonSetupZoneData = {
  zone: MapZone
  revealed: boolean
  tokens: DungeonSetupZoneToken[]
}
export type DungeonSetupZoneNode = Node<
  DungeonSetupZoneData,
  "dungeonSetupZone"
>

/**
 * A Zone on the encounter **Setup** board (UNN-467) — read-only geography with the
 * combatant-inclusion affordance. PC tokens carry an inclusion tick and toggle
 * in/out of the staged fight on tap (the {@link import("./dungeon-setup-canvas-context").useDungeonSetupCanvas}
 * peer of the panel's Players list); out-of-roster PCs dim. Staged enemies show as
 * planned arrivals (managed from the panel). No movement or reveal here — Setup
 * only picks who fights.
 */
export function DungeonSetupZoneNode({
  data,
}: NodeProps<DungeonSetupZoneNode>) {
  const { isIncluded, onTogglePc, disabled } = useDungeonSetupCanvas()
  const { zone, revealed, tokens } = data

  return (
    <>
      <FloatingEdgeHandles />
      <Card
        size="sm"
        aria-label={`Zone: ${zone.name}`}
        className={cn("min-h-48 w-86 shadow-sm", !revealed && "bg-muted/40")}
      >
        <CardHeader>
          <CardTitle
            className={cn(
              "flex items-center gap-1.5 text-base",
              !revealed && "text-muted-foreground"
            )}
          >
            <span className="truncate">{zone.name}</span>
          </CardTitle>
          <CardAction className="text-xs text-muted-foreground tabular-nums">
            {tokens.length}
          </CardAction>
        </CardHeader>

        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-xs text-muted-foreground">Empty</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {tokens.map((token) =>
                token.isPc ? (
                  <li key={token.id}>
                    <button
                      type="button"
                      disabled={disabled}
                      onClick={() => onTogglePc(token.id)}
                      aria-pressed={isIncluded(token.id)}
                      aria-label={`${token.name}${isIncluded(token.id) ? " (in the fight)" : " (excluded)"}`}
                      className={cn(
                        "inline-flex max-w-[10rem] items-center gap-1.5 border border-blue-700 bg-blue-100 py-1 pr-2 pl-1 dark:border-blue-400 dark:bg-blue-950",
                        !isIncluded(token.id) && "opacity-40 grayscale"
                      )}
                    >
                      {token.portraitUrl ? (
                        <Image
                          src={token.portraitUrl}
                          alt=""
                          width={20}
                          height={20}
                          className="size-5 shrink-0 object-cover"
                        />
                      ) : (
                        <span
                          aria-hidden
                          className="flex size-5 shrink-0 items-center justify-center bg-blue-200 text-[9px] font-semibold text-blue-900 dark:bg-blue-900 dark:text-blue-100"
                        >
                          {initials(token.name, "?")}
                        </span>
                      )}
                      <span className="truncate text-xs font-medium text-blue-950 dark:text-blue-100">
                        {token.name}
                      </span>
                      {isIncluded(token.id) ? (
                        <CheckCircleIcon
                          weight="fill"
                          className="size-3.5 shrink-0 text-blue-700 dark:text-blue-300"
                          aria-hidden
                        />
                      ) : (
                        <CircleDashedIcon
                          className="size-3.5 shrink-0 text-muted-foreground"
                          aria-hidden
                        />
                      )}
                    </button>
                  </li>
                ) : (
                  <li key={token.id}>
                    <span className="inline-flex max-w-[10rem] items-center gap-1.5 border border-dashed border-red-400 bg-red-50 py-1 pr-2 pl-1 text-red-900 dark:bg-red-950/50 dark:text-red-100">
                      <span
                        aria-hidden
                        className="flex size-5 shrink-0 items-center justify-center bg-red-200 text-[9px] font-semibold text-red-900 dark:bg-red-900 dark:text-red-100"
                      >
                        {initials(token.name, "?")}
                      </span>
                      <span className="truncate text-xs font-medium">
                        {token.name}
                      </span>
                    </span>
                  </li>
                )
              )}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
