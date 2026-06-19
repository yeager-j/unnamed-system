"use client"

import {
  EyeIcon,
  EyeSlashIcon,
  NoteIcon,
  UsersThreeIcon,
} from "@phosphor-icons/react/dist/ssr"
import { NodeToolbar, Position, type Node, type NodeProps } from "@xyflow/react"

import type { MapZone } from "@workspace/game/foundation"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Separator } from "@workspace/ui/components/separator"
import { cn } from "@workspace/ui/lib/utils"

import { useDungeonCanvas } from "./dungeon-canvas-context"
import { DungeonTokenChip } from "./dungeon-token-chip"
import { FloatingEdgeHandles } from "./floating-edge-handles"

export type DungeonZoneToken = {
  characterId: string
  name: string
  portraitUrl: string | null
}
export type DungeonZoneData = {
  zone: MapZone
  revealed: boolean
  tokens: DungeonZoneToken[]
}
export type DungeonZoneNode = Node<DungeonZoneData, "dungeonZone">

/**
 * A Zone on the run console (UNN-464) — the play counterpart of the template
 * `ZoneNode`, built on the shadcn {@link Card} so it matches the combat
 * battlefield's zone cards ({@link import("@/components/combat/zone-layout").ZoneLayout}):
 * the Zone name, the occupant count in the header action, and the party tokens
 * rendered **inside** the card as side-tinted chips. Reveal state reads
 * **non-by-color** — an eye-slash glyph + a muted card when players can't see it
 * yet. Selecting it reveals a {@link NodeToolbar} whose actions (reveal/hide, Move
 * party here, open the Zone details sheet) dispatch through {@link useDungeonCanvas}.
 * The hidden source/target handles only need to *exist* — React Flow won't create
 * an edge for a node with no handles — while the floating-edge router decides where
 * the connection actually attaches.
 */
export function DungeonZoneNode({
  data,
  selected,
}: NodeProps<DungeonZoneNode>) {
  const { revealZone, hideZone, moveParty, openDetails } = useDungeonCanvas()
  const { zone, revealed, tokens } = data

  return (
    <>
      <NodeToolbar
        isVisible={selected}
        position={Position.Top}
        className="flex items-center gap-1 rounded-none border bg-popover p-1 shadow-md"
      >
        <Button
          size="sm"
          variant={revealed ? "secondary" : "ghost"}
          aria-pressed={revealed}
          onClick={() => (revealed ? hideZone(zone.id) : revealZone(zone.id))}
        >
          {revealed ? <EyeIcon /> : <EyeSlashIcon />}
          {revealed ? "Revealed" : "Reveal to players"}
        </Button>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <Button size="sm" variant="ghost" onClick={() => moveParty(zone.id)}>
          <UsersThreeIcon />
          Move party here
        </Button>
        <Separator orientation="vertical" className="mx-0.5 h-5" />
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label="Zone details"
          onClick={() => openDetails(zone.id)}
        >
          <NoteIcon />
        </Button>
      </NodeToolbar>

      <FloatingEdgeHandles />

      <Card
        size="sm"
        selected={selected}
        aria-label={`Zone: ${zone.name}${revealed ? "" : " (hidden from players)"}`}
        className={cn(
          "min-h-48 w-86 cursor-pointer shadow-sm transition-shadow",
          !revealed && "bg-muted/40"
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
          <CardAction className="text-xs text-muted-foreground tabular-nums">
            {tokens.length}
          </CardAction>
        </CardHeader>

        <CardContent>
          {tokens.length === 0 ? (
            <p className="text-xs text-muted-foreground">Empty</p>
          ) : (
            <ul className="flex flex-wrap gap-1.5">
              {tokens.map((token) => (
                <li key={token.characterId}>
                  <DungeonTokenChip
                    name={token.name}
                    portraitUrl={token.portraitUrl}
                  />
                </li>
              ))}
            </ul>
          )}
        </CardContent>
      </Card>
    </>
  )
}
