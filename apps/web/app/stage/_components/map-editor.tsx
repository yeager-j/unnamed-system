"use client"

import dynamic from "next/dynamic"
import { useState } from "react"

import type { MapGeometry } from "@workspace/game-v2/spatial"
import { Spinner } from "@workspace/ui/components/spinner"

import { useMapAutoSave } from "@/app/stage/_hooks/use-map-autosave"
import type { MapRow } from "@/lib/db/schema/map"

import { MapSettingsPanel } from "./map-settings-panel"

/**
 * The Map editor (UNN-460 shell + UNN-461 canvas): a full-bleed node-graph canvas
 * with a floating {@link MapSettingsPanel} (back, name, save status, counts, delete)
 * over the top-left and the tool palette along the bottom — no header bars (the
 * site header is hidden on this route). The canvas is a `"use client"` React Flow
 * island, lazy-loaded (`ssr: false`) so it renders only against a measured DOM and
 * non-map routes don't pay for it. Name and geometry autosave through one shared
 * version token ({@link useMapAutoSave}); a local geometry mirror feeds the panel's
 * live zone/connection counts.
 */
const MapCanvas = dynamic(
  () =>
    import("@/components/shared/canvas/map-canvas").then(
      (module) => module.MapCanvas
    ),
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
  const { name, saveGeometry, save } = useMapAutoSave({
    mapId: map.id,
    serverName: map.name,
    serverGeometry: map.geometry,
    serverVersion: map.version,
  })
  const [geometry, setGeometry] = useState(map.geometry)

  function handleGeometryChange(next: MapGeometry) {
    setGeometry(next)
    saveGeometry(next)
  }

  return (
    <main aria-label="Map builder" className="relative min-h-0 flex-1">
      <div className="absolute inset-0">
        <MapCanvas
          geometry={map.geometry}
          onGeometryChange={handleGeometryChange}
          cartoucheTitle={name.value}
          // The editor pages itself — the canvas owns activePageId and the
          // floating tab strip (UNN-586); pages ride the whole-blob autosave.
          showPageTabs
        />
      </div>

      <div className="pointer-events-none absolute inset-4 z-10">
        <div className="pointer-events-auto w-fit">
          <MapSettingsPanel
            name={name}
            save={save}
            zoneCount={Object.keys(geometry.zones).length}
            connectionCount={Object.keys(geometry.connections).length}
            mapId={map.id}
          />
        </div>
      </div>
    </main>
  )
}
