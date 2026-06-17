"use client"

import dynamic from "next/dynamic"

import { Spinner } from "@workspace/ui/components/spinner"
import { cn } from "@workspace/ui/lib/utils"

import { useMapAutoSave } from "@/hooks/use-map-autosave"
import type { MapRow } from "@/lib/db/schema/map"

import { DeleteMapButton } from "./delete-map-button"

/**
 * The Map editor (UNN-460 shell + UNN-461 canvas): an autosaving name field (no
 * Save button) above the node-graph canvas. The canvas is a `"use client"` React
 * Flow island, lazy-loaded (`ssr: false`) so it renders only against a measured
 * DOM and non-map routes don't pay for it. Name and geometry autosave through one
 * shared version token ({@link useMapAutoSave}).
 */
const MapCanvas = dynamic(
  () => import("./canvas/map-canvas").then((module) => module.MapCanvas),
  {
    ssr: false,
    loading: () => (
      <div className="flex size-full items-center justify-center">
        <Spinner className="size-6 text-muted-foreground" />
      </div>
    ),
  }
)

export function MapEditor({ map }: { map: MapRow }) {
  const { name, saveGeometry } = useMapAutoSave({
    mapId: map.id,
    serverName: map.name,
    serverGeometry: map.geometry,
    serverVersion: map.version,
  })

  return (
    <main className="flex flex-1 flex-col">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-3">
        <input
          type="text"
          aria-label="Map name"
          maxLength={100}
          value={name.value}
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
          className={cn(
            "font-heading text-2xl font-semibold",
            "max-w-full min-w-0 border-0 bg-transparent p-0 outline-none",
            "border-b border-transparent transition-colors",
            "focus-visible:border-ring focus-visible:ring-0",
            "hover:border-border"
          )}
        />
        <DeleteMapButton mapId={map.id} mapName={name.value || map.name} />
      </header>

      <section aria-label="Map builder" className="relative min-h-0 flex-1">
        <div className="absolute inset-0">
          <MapCanvas geometry={map.geometry} onGeometryChange={saveGeometry} />
        </div>
      </section>
    </main>
  )
}
