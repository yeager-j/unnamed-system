"use client"

import { MapTrifoldIcon } from "@phosphor-icons/react/dist/ssr"

import { cn } from "@workspace/ui/lib/utils"

import { useMapNameAutoSave } from "@/hooks/use-map-name-autosave"
import type { MapRow } from "@/lib/db/schema/map"

import { DeleteMapButton } from "./delete-map-button"

/**
 * The Map editor shell (UNN-460): an autosaving name field (no Save button) over
 * a placeholder canvas region, plus the delete control. The node-graph canvas
 * itself — add/drag Zones, draw adjacency, toggle hidden/locked, edit
 * descriptions + DM notes — is UNN-461 (React Flow); it drops into the
 * placeholder and autosaves geometry through the same `saveMapAction` this shell
 * already wires for the name.
 */
export function MapEditor({ map }: { map: MapRow }) {
  const { value, onChange, flush, revert } = useMapNameAutoSave({
    mapId: map.id,
    serverName: map.name,
    serverVersion: map.version,
  })

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <input
          type="text"
          aria-label="Map name"
          maxLength={100}
          value={value}
          onChange={(event) => onChange(event.target.value)}
          onBlur={flush}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              event.currentTarget.blur()
            } else if (event.key === "Escape") {
              event.preventDefault()
              revert()
              event.currentTarget.blur()
            }
          }}
          className={cn(
            "font-heading text-2xl font-semibold",
            "max-w-full min-w-0 border-0 bg-transparent p-0 outline-none",
            "border-b border-transparent transition-colors",
            "focus-visible:border-ring focus-visible:ring-0",
            "hover:border-border"
          )}
        />
        <DeleteMapButton mapId={map.id} mapName={value || map.name} />
      </header>

      <section
        aria-label="Map builder"
        className="flex min-h-96 flex-1 flex-col items-center justify-center gap-2 border border-dashed text-center text-muted-foreground"
      >
        <MapTrifoldIcon className="size-8" />
        <p className="text-sm font-medium">Map builder coming soon</p>
        <p className="max-w-sm text-xs">
          The node-graph canvas — add zones, wire connections, and write
          descriptions — arrives next. Your map name autosaves as you type.
        </p>
      </section>
    </main>
  )
}
