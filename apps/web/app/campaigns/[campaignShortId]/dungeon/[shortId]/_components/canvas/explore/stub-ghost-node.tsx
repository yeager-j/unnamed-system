"use client"

import type { Node, NodeProps } from "@xyflow/react"
import { useState } from "react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"
import { Spinner } from "@workspace/ui/components/spinner"

import { useDungeonCanvas } from "@/app/campaigns/[campaignShortId]/dungeon/[shortId]/_components/canvas/explore/context"

/**
 * A generation **stub** on the DM exploration board (UNN-590/UNN-642, D8) — the
 * dashed ghost of a room that doesn't exist yet, hanging off its parent Zone
 * along the stub's bearing. P3a rendered the frontier inert; P3b lands the
 * click: one press rolls the expansion server-side (mint / loop closure / dead
 * end — never a dead click), the ghost spins through the round trip, and the
 * refetched canon paints the outcome (D1 — nothing about the roll is applied
 * optimistically). Right-click opens the context menu with **Force pick**
 * (DM chooses the template; identical server path). DM-only by construction:
 * the watch never sees this node — players get the stub as an ordinary exit
 * silhouette in the snapshot (D10).
 *
 * Visual grammar rhymes with the `unmapped` ThresholdNotch (dashed, muted,
 * void-filled): same "leads somewhere uncharted" voice, one register louder so
 * the DM can find the expandable frontier at a glance.
 */
export type StubGhostData = {
  stubId: string
  parentZoneName: string
}
export type StubGhostNode = Node<StubGhostData, "stubGhost">

/** Ghost card size — smaller than any real footprint; render-only. */
export const GHOST_SIZE = { w: 96, h: 72 }

export function DungeonStubGhostNode({ data }: NodeProps<StubGhostNode>) {
  const {
    expandStub,
    forcePickStub,
    isStubPending,
    expandTemplates,
    disabled,
  } = useDungeonCanvas()
  const [menuOpen, setMenuOpen] = useState(false)
  const pending = isStubPending(data.stubId)
  const inert = pending || disabled

  return (
    <div
      className="relative"
      style={{ width: GHOST_SIZE.w, height: GHOST_SIZE.h }}
    >
      <button
        type="button"
        aria-label={`Expand passage off ${data.parentZoneName}`}
        aria-disabled={inert}
        className="flex h-full w-full cursor-pointer items-center justify-center border border-dashed border-muted-foreground/50 bg-transparent opacity-60 transition-opacity hover:opacity-90 focus-visible:opacity-90 aria-disabled:cursor-default aria-disabled:hover:opacity-60"
        // A ghost click must never bubble into the canvas's `onNodeClick`
        // zone semantics (the zone-node toolbar documents the same hazard).
        onClick={(event) => {
          event.stopPropagation()
          if (!inert) expandStub(data.stubId)
        }}
        onContextMenu={(event) => {
          event.preventDefault()
          event.stopPropagation()
          if (!inert) setMenuOpen(true)
        }}
      >
        {pending ? (
          <Spinner className="size-4 text-muted-foreground" />
        ) : (
          <span className="text-[10px] tracking-widest text-muted-foreground uppercase select-none">
            ?
          </span>
        )}
      </button>
      <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
        {/* The button owns both gestures (left-click expands, right-click opens
            the menu), so the trigger is only the menu's positioning anchor —
            inert to the pointer, spanning the node. */}
        <DropdownMenuTrigger
          render={
            <span
              aria-hidden
              className="pointer-events-none absolute inset-0"
            />
          }
        />
        <DropdownMenuContent align="start">
          <DropdownMenuItem
            disabled={inert}
            onClick={() => expandStub(data.stubId)}
          >
            Expand (roll)
          </DropdownMenuItem>
          {expandTemplates.length > 0 ? (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger>Force pick…</DropdownMenuSubTrigger>
              <DropdownMenuSubContent className="max-h-72 overflow-y-auto">
                {expandTemplates.map((template) => (
                  <DropdownMenuItem
                    key={template.key}
                    disabled={inert}
                    onClick={() => forcePickStub(data.stubId, template.key)}
                  >
                    {template.name}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          ) : null}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}
