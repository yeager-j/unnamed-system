"use client"

import {
  ArrowsLeftRightIcon,
  CaretLeftIcon,
  CaretRightIcon,
  CopyIcon,
  PencilSimpleIcon,
  StackIcon,
  TrashIcon,
} from "@phosphor-icons/react/dist/ssr"
import { Handle, NodeToolbar, Position, type NodeProps } from "@xyflow/react"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Separator } from "@workspace/ui/components/separator"
import { TooltipButton } from "@workspace/ui/components/tooltip-button"
import { cn } from "@workspace/ui/lib/utils"

import { editorZoneView } from "@/domain/dungeon/view/set-piece-view"
import { ZONE_SIZE_LABELS } from "@/domain/labels"
import type { ZoneSize } from "@/domain/map/view/footprints"

import type { ZoneNode as ZoneNodeType } from "./geometry-to-flow"
import { useConnectionHighlight } from "./hovered-connection-context"
import { useMapCanvas } from "./map-canvas-context"
import { OccupantToken } from "./set-piece/occupant-chips"
import { PageLinkChips } from "./set-piece/page-link-chip"
import { ZoneSetPiece } from "./set-piece/zone-set-piece"

const SIZE_LADDER: ZoneSize[] = ["S", "M", "L", "XL"]

/** The next size up/down the ladder from `current` (unset ⇒ M), clamped at the ends. */
function steppedSize(
  current: ZoneSize | undefined,
  direction: -1 | 1
): ZoneSize {
  const index = SIZE_LADDER.indexOf(current ?? "M")
  const next = Math.min(Math.max(index + direction, 0), SIZE_LADDER.length - 1)
  return SIZE_LADDER[next]!
}

/**
 * A Zone rendered as a React Flow node (UNN-461) — a small card showing the Zone's
 * name, with a floating {@link NodeToolbar} (Edit details / Delete) and **four
 * connection handles** (one per side, FigJam-style) that appear while the Zone is
 * selected in edit mode; you drag from any of them to draw a connection. The
 * handles only choose the *grab point* — the resulting edge is a floating one
 * ({@link import("./connection-edge").ConnectionEdge}) that attaches to whichever
 * borders face each other — so they stay connectable (as drop targets) even while
 * invisible. All editing affordances disappear under `interactivity === "readonly"`.
 */
const HANDLE_SIDES = [
  { id: "top", position: Position.Top },
  { id: "right", position: Position.Right },
  { id: "bottom", position: Position.Bottom },
  { id: "left", position: Position.Left },
] as const

export function ZoneNode({ data, selected }: NodeProps<ZoneNodeType>) {
  const {
    interactivity,
    openZoneDetails,
    setZoneIdentity,
    duplicateZone,
    deleteZone,
    pages,
    navigateToPage,
    openConnectPicker,
    moveZoneToPage,
    lockedZoneIds,
    zoneOccupants,
  } = useMapCanvas()
  const editable = interactivity === "edit"
  const { zone, crossPageLinks } = data
  const locked = lockedZoneIds?.has(zone.id) ?? false
  const occupants = zoneOccupants?.(zone.id) ?? []
  const view = editorZoneView(zone, occupants)
  const partnerHighlighted = useConnectionHighlight(zone.id)
  const otherPages = pages.filter((page) => page.id !== zone.pageId)

  const toolbar = (
    <NodeToolbar
      isVisible={editable && selected}
      position={Position.Top}
      className="flex items-center gap-1 rounded-lg border bg-popover p-1 shadow-md"
    >
      <Button
        size="sm"
        variant="ghost"
        onClick={() => openZoneDetails(zone.id)}
      >
        <PencilSimpleIcon />
        Edit details
      </Button>
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <div className="flex items-center gap-0.5">
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Shrink ${zone.name}`}
          disabled={(zone.size ?? "M") === "S"}
          onClick={() =>
            setZoneIdentity(zone.id, { size: steppedSize(zone.size, -1) })
          }
        >
          <CaretLeftIcon />
        </Button>
        <span
          className="w-6 text-center text-xs font-medium tabular-nums"
          aria-label={`Size ${ZONE_SIZE_LABELS[zone.size ?? "M"]}`}
        >
          {zone.size ?? "M"}
        </span>
        <Button
          size="icon-sm"
          variant="ghost"
          aria-label={`Grow ${zone.name}`}
          disabled={(zone.size ?? "M") === "XL"}
          onClick={() =>
            setZoneIdentity(zone.id, { size: steppedSize(zone.size, 1) })
          }
        >
          <CaretRightIcon />
        </Button>
      </div>
      <Separator orientation="vertical" className="mx-0.5 h-5" />
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Connect ${zone.name} to another zone`}
        onClick={() => openConnectPicker(zone.id)}
      >
        <ArrowsLeftRightIcon />
      </Button>
      {otherPages.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={`Move ${zone.name} to another page`}
              />
            }
          >
            <StackIcon />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start">
            {otherPages.map((page) => (
              <DropdownMenuItem
                key={page.id}
                onClick={() => moveZoneToPage(zone.id, page.id)}
              >
                Move to {page.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      <Button
        size="icon-sm"
        variant="ghost"
        aria-label={`Duplicate ${zone.name}`}
        onClick={() => duplicateZone(zone.id)}
      >
        <CopyIcon />
      </Button>
      <TooltipButton
        size="icon-sm"
        variant="ghost"
        aria-label={`Delete ${zone.name}`}
        disabled={locked}
        disabledReason="Occupied — move the party out first"
        onClick={() => deleteZone(zone.id)}
      >
        <TrashIcon />
      </TooltipButton>
    </NodeToolbar>
  )

  const handles =
    editable &&
    HANDLE_SIDES.map(({ id, position }) => (
      <Handle
        key={id}
        id={id}
        type="source"
        position={position}
        className={cn(
          "!size-3 !rounded-full !border-2 !border-ring !bg-background transition-opacity",
          selected ? "!opacity-100" : "!opacity-0"
        )}
      />
    ))

  return (
    <ZoneSetPiece
      view={view}
      selected={selected}
      partnerHighlighted={partnerHighlighted}
      toolbar={toolbar}
      handles={handles}
      pageLinks={
        crossPageLinks.length > 0 ? (
          <PageLinkChips links={crossPageLinks} onNavigate={navigateToPage} />
        ) : undefined
      }
      closeupRoster={
        occupants.length > 0 ? (
          <ul className="flex flex-wrap gap-1.5">
            {occupants.map((occupant) => (
              <li key={occupant.key}>
                <OccupantToken occupant={occupant} />
              </li>
            ))}
          </ul>
        ) : undefined
      }
    />
  )
}
