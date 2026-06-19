"use client"

import {
  EyeIcon,
  FlagIcon,
  MagnifyingGlassMinusIcon,
  MagnifyingGlassPlusIcon,
  UserPlusIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Panel, useReactFlow, useViewport } from "@xyflow/react"
import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { EndCombatDialog } from "@/components/combat/end-combat-dialog"

import { useDungeonCombatCanvas } from "./dungeon-combat-canvas-context"

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  )
}

/**
 * The combat-phase bottom **Panel** (UNN-467) — the combat peer of the
 * exploration {@link import("./turn-loop-bar").TurnLoopBar}. Pinned inside React
 * Flow so it can drive the viewport, it holds the static combat verbs (the
 * ticket's bottom toolbar): the Round badge, **End turn** (while a combatant is
 * acting), **Add combatant** (mid-fight reinforcement), **Player view** (the
 * read-only fog view), **End encounter**, and the shared zoom cluster. Whose-turn
 * drafting lives in the top {@link import("./combat-spine-panel").CombatSpinePanel};
 * all state comes from {@link useDungeonCombatCanvas}.
 */
export function CombatTurnBar() {
  const {
    round,
    phase,
    onEndTurn,
    onAddCombatant,
    playerViewHref,
    onEndEncounter,
    fallenPcNames,
    disabled,
  } = useDungeonCombatCanvas()
  const { zoomIn, zoomOut, fitView } = useReactFlow()
  const { zoom } = useViewport()
  const duration = prefersReducedMotion() ? 0 : 250

  return (
    <Panel position="bottom-center" className="mb-4">
      <TooltipProvider delay={300}>
        <div className="flex flex-wrap items-center gap-1 rounded-none border bg-popover p-3 shadow-lg">
          <Badge variant="outline" className="font-serif tabular-nums">
            Round {round}
          </Badge>

          {phase === "active" ? (
            <Button size="sm" onClick={onEndTurn} disabled={disabled}>
              <FlagIcon weight="fill" />
              End turn
            </Button>
          ) : phase === "resolving" ? (
            <Button size="sm" variant="outline" disabled>
              Resolving…
            </Button>
          ) : null}

          <Separator orientation="vertical" className="mx-1" />

          <Button
            size="sm"
            variant="outline"
            onClick={onAddCombatant}
            disabled={disabled}
          >
            <UserPlusIcon weight="bold" />
            Add combatant
          </Button>

          <Button
            size="sm"
            variant="outline"
            nativeButton={false}
            render={
              <Link
                href={playerViewHref}
                target="_blank"
                rel="noopener noreferrer"
              />
            }
          >
            <EyeIcon />
            Player view
          </Button>

          <EndCombatDialog
            fallenPcNames={fallenPcNames}
            onConfirm={onEndEncounter}
            disabled={disabled}
          />

          <Separator orientation="vertical" className="mx-1" />

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Zoom out"
                  onClick={() => void zoomOut({ duration })}
                />
              }
            >
              <MagnifyingGlassMinusIcon />
            </TooltipTrigger>
            <TooltipContent>Zoom out</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  variant="ghost"
                  className="min-w-14 tabular-nums"
                  aria-label="Fit view"
                  onClick={() => void fitView({ duration, padding: 0.2 })}
                />
              }
            >
              {Math.round(zoom * 100)}%
            </TooltipTrigger>
            <TooltipContent>Fit view</TooltipContent>
          </Tooltip>

          <Tooltip>
            <TooltipTrigger
              render={
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label="Zoom in"
                  onClick={() => void zoomIn({ duration })}
                />
              }
            >
              <MagnifyingGlassPlusIcon />
            </TooltipTrigger>
            <TooltipContent>Zoom in</TooltipContent>
          </Tooltip>
        </div>
      </TooltipProvider>
    </Panel>
  )
}
