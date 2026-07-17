"use client"

import { CaretDownIcon, CaretUpIcon } from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@workspace/ui/components/collapsible"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"

import type { MapSaveStatus } from "@/app/stage/_hooks/use-map-autosave"
import { CanvasPanel } from "@/components/shared/canvas/canvas-panel"
import { stageMapsPath } from "@/lib/paths"

import { DeleteMapButton } from "./delete-map-button"
import { SaveStatus } from "./save-status"

/**
 * The Map editor's floating top-left control card (UNN-460 chrome pass) — replaces
 * the old header bar now that the canvas is full-bleed. A back arrow returns to My
 * Maps, the map name reads as the card title, and a collapse caret tucks the body
 * away to free the canvas. Expanded, it holds the name field, a live save-status +
 * geometry-count footer, and the delete control. Counts come from the host (the
 * canvas owns the live geometry); save state comes from the autosave hook.
 */
export function MapSettingsPanel({
  name,
  save,
  zoneCount,
  connectionCount,
  mapId,
}: {
  name: {
    value: string
    onChange: (value: string) => void
    flush: () => void
    revert: () => void
  }
  save: { status: MapSaveStatus; lastSavedAt: number | null }
  zoneCount: number
  connectionCount: number
  mapId: string
}) {
  const [expanded, setExpanded] = useState(true)

  return (
    <Collapsible open={expanded} onOpenChange={setExpanded}>
      <CanvasPanel
        backHref={stageMapsPath()}
        backLabel="Back to My Maps"
        title={name.value || "Untitled map"}
        actions={
          <CollapsibleTrigger
            render={
              <Button
                size="icon-sm"
                variant="ghost"
                aria-label={
                  expanded ? "Collapse map settings" : "Expand map settings"
                }
              />
            }
          >
            {expanded ? <CaretUpIcon /> : <CaretDownIcon />}
          </CollapsibleTrigger>
        }
      >
        <CollapsibleContent>
          <div className="flex flex-col gap-4 px-3 pb-3">
            <div className="flex flex-col gap-1.5">
              <Label
                htmlFor="map-name"
                className="text-xs font-medium tracking-wide text-muted-foreground uppercase"
              >
                Map name
              </Label>
              <Input
                id="map-name"
                value={name.value}
                maxLength={100}
                onChange={(event) => name.onChange(event.target.value)}
                onBlur={name.flush}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault()
                    event.currentTarget.blur()
                  } else if (event.key === "Escape") {
                    event.preventDefault()
                    name.revert()
                    event.currentTarget.blur()
                  }
                }}
              />
            </div>

            <Separator />

            <div className="flex items-center justify-between gap-2 text-xs text-muted-foreground">
              <SaveStatus save={save} />
              <span className="tabular-nums">
                {zoneCount} {zoneCount === 1 ? "zone" : "zones"} ·{" "}
                {connectionCount}{" "}
                {connectionCount === 1 ? "connection" : "connections"}
              </span>
            </div>

            <DeleteMapButton mapId={mapId} mapName={name.value} />
          </div>
        </CollapsibleContent>
      </CanvasPanel>
    </Collapsible>
  )
}
