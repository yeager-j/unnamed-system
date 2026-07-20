"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import type { MapGeometry } from "@workspace/game-v2/spatial"

import { saveMapAction } from "@/lib/actions/save-map"

import { useSerializeLatest } from "./use-serialize-latest"

const NAME_DEBOUNCE_MS = 600
const GEOMETRY_DEBOUNCE_MS = 600

/**
 * The editor's save indicator state: `saved` once the server has the latest edit,
 * `saving` while a write is in flight, `error` after a failed write (the local
 * edits stay; see the geometry note above).
 */
export type MapSaveStatus = "saved" | "saving" | "error"

/**
 * Debounced auto-save coordinator for the Map editor (UNN-460 name + UNN-461
 * geometry) — the no-Save-button editor. Map authoring is deliberately
 * per-field last-writer-wins: each action updates only `name` or `geometry`, and
 * cross-tab edits by the single owner resolve by whichever field write lands
 * last. Within this editor, both fields share {@link useSerializeLatest}, so a
 * slow save cannot be overtaken and repeated edits to one waiting field collapse
 * to its newest value.
 *
 * This hook keeps only the per-field lifecycle glue. The name keeps its own draft
 * `value` + revert-on-failure (the field's server value is authoritative).
 * **Geometry does not hard-revert on failure:** each save persists the *whole*
 * `geometry` blob, so a transient failure self-heals on the next edit, and
 * discarding a canvas of work on a blip is worse than keeping it — a failure
 * toasts and leaves the local edits in place. Name
 * and geometry debounce on **independent timers** (a keystroke must not cancel a
 * pending node-drag save) but serialize through one save spine. Both flush on
 * unmount so a client-side nav mid-debounce doesn't drop the last edit.
 */
export function useMapAutoSave({
  mapId,
  serverName,
  serverGeometry,
}: {
  mapId: string
  serverName: string
  serverGeometry: MapGeometry
}) {
  const [value, setValue] = useState(serverName)
  const [status, setStatus] = useState<MapSaveStatus>("saved")
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const serializeLatest = useSerializeLatest((error) => {
    console.error("[useMapAutoSave] save threw", error)
    setStatus("error")
    onSaveFailure()
  })
  const lastSavedNameRef = useRef(serverName)
  const currentNameRef = useRef(serverName)
  const lastSavedGeometryRef = useRef(JSON.stringify(serverGeometry))
  const pendingGeometryRef = useRef<MapGeometry | null>(null)
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geometryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onSaveFailure(): void {
    toast.error("Couldn't save the map. Try again.")
  }

  function enqueueNameSave(next: string): void {
    const trimmed = next.trim()

    serializeLatest("name", async () => {
      if (trimmed.length === 0 || trimmed === lastSavedNameRef.current.trim())
        return

      setStatus("saving")
      const result = await saveMapAction({
        mapId,
        patch: { field: "name", name: trimmed },
      })
      if (result.ok) {
        lastSavedNameRef.current = trimmed
        setStatus("saved")
        setLastSavedAt(Date.now())
        return
      }
      if (currentNameRef.current.trim() === trimmed) {
        currentNameRef.current = lastSavedNameRef.current
        setValue(lastSavedNameRef.current)
      }
      setStatus("error")
      onSaveFailure()
    })
  }

  function enqueueGeometrySave(geometry: MapGeometry): void {
    pendingGeometryRef.current = null

    serializeLatest("geometry", async () => {
      const serialized = JSON.stringify(geometry)
      if (serialized === lastSavedGeometryRef.current) return

      setStatus("saving")
      const result = await saveMapAction({
        mapId,
        patch: { field: "geometry", geometry },
      })
      if (result.ok) {
        lastSavedGeometryRef.current = serialized
        setStatus("saved")
        setLastSavedAt(Date.now())
        return
      }
      setStatus("error")
      onSaveFailure()
    })
  }

  function onChange(next: string): void {
    currentNameRef.current = next
    setValue(next)
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current)
    nameTimerRef.current = setTimeout(
      () => enqueueNameSave(next),
      NAME_DEBOUNCE_MS
    )
  }

  function flush(): void {
    if (nameTimerRef.current) {
      clearTimeout(nameTimerRef.current)
      nameTimerRef.current = null
    }
    enqueueNameSave(value)
  }

  function revert(): void {
    currentNameRef.current = lastSavedNameRef.current
    setValue(lastSavedNameRef.current)
  }

  function saveGeometry(geometry: MapGeometry): void {
    pendingGeometryRef.current = geometry
    if (geometryTimerRef.current) clearTimeout(geometryTimerRef.current)
    geometryTimerRef.current = setTimeout(
      () => enqueueGeometrySave(geometry),
      GEOMETRY_DEBOUNCE_MS
    )
  }

  const flushOnUnmount = useEffectEvent(() => {
    if (nameTimerRef.current) {
      clearTimeout(nameTimerRef.current)
      enqueueNameSave(value)
    }
    if (geometryTimerRef.current && pendingGeometryRef.current) {
      clearTimeout(geometryTimerRef.current)
      enqueueGeometrySave(pendingGeometryRef.current)
    }
  })

  useEffect(() => () => flushOnUnmount(), [])

  return {
    name: { value, onChange, flush, revert },
    saveGeometry,
    save: { status, lastSavedAt },
  }
}
