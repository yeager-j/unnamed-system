"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import type { MapGeometry } from "@workspace/game-v2/spatial"

import { saveMapAction } from "@/lib/actions/save-map"

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
 * geometry) — the no-Save-button editor. The Map's **name and geometry share one
 * `version` token** (`maps.version`), so they must round-trip it through **one**
 * `versionRef` and **one** serialized `saveQueueRef`: two independent refs would
 * false-`stale` each other when a name edit and a node drag land back-to-back. This
 * hook is that single owner. (UNN-483 tracks extracting the shared concurrency core
 * this still duplicates from the character autosave; keep it standalone here — Map
 * authoring is single-owner with no per-class version plumbing.)
 *
 * The name keeps its own draft `value` + revert-on-failure (the field's server
 * value is authoritative). **Geometry does not hard-revert on failure:** each save
 * persists the *whole* `geometry` blob, so a transient failure self-heals on the
 * next edit, and discarding a canvas of work on a blip is worse than keeping it —
 * a failure toasts (refresh-prompt on `"stale"`) and leaves the local edits in
 * place. Name and geometry debounce on **independent timers** (a keystroke must not
 * cancel a pending node-drag save) but serialize through the one queue, each
 * reading the freshly-bumped token inside the chain. Both flush on unmount so a
 * client-side nav mid-debounce doesn't drop the last edit.
 */
export function useMapAutoSave({
  mapId,
  serverName,
  serverGeometry,
  serverVersion,
}: {
  mapId: string
  serverName: string
  serverGeometry: MapGeometry
  serverVersion: number
}) {
  const [value, setValue] = useState(serverName)
  const [status, setStatus] = useState<MapSaveStatus>("saved")
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const versionRef = useRef(serverVersion)
  const lastSavedNameRef = useRef(serverName)
  const lastSavedGeometryRef = useRef(JSON.stringify(serverGeometry))
  const pendingGeometryRef = useRef<MapGeometry | null>(null)
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geometryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  useEffect(() => {
    versionRef.current = serverVersion
  }, [serverVersion])

  function onSaveFailure(stale: boolean): void {
    toast.error(
      stale
        ? "Couldn't sync the map — refresh to see the latest changes."
        : "Couldn't save the map. Try again."
    )
  }

  function enqueueNameSave(next: string): Promise<void> {
    const trimmed = next.trim()

    saveQueueRef.current = saveQueueRef.current.then(async () => {
      if (trimmed.length === 0 || trimmed === lastSavedNameRef.current.trim())
        return

      setStatus("saving")
      const result = await saveMapAction({
        mapId,
        expectedVersion: versionRef.current,
        patch: { field: "name", name: trimmed },
      })
      if (result.ok) {
        versionRef.current = result.value.version
        lastSavedNameRef.current = trimmed
        setStatus("saved")
        setLastSavedAt(Date.now())
        return
      }
      setValue(lastSavedNameRef.current)
      setStatus("error")
      onSaveFailure(result.error === "stale")
    })

    return saveQueueRef.current
  }

  function enqueueGeometrySave(geometry: MapGeometry): Promise<void> {
    pendingGeometryRef.current = null

    saveQueueRef.current = saveQueueRef.current.then(async () => {
      const serialized = JSON.stringify(geometry)
      if (serialized === lastSavedGeometryRef.current) return

      setStatus("saving")
      const result = await saveMapAction({
        mapId,
        expectedVersion: versionRef.current,
        patch: { field: "geometry", geometry },
      })
      if (result.ok) {
        versionRef.current = result.value.version
        lastSavedGeometryRef.current = serialized
        setStatus("saved")
        setLastSavedAt(Date.now())
        return
      }
      setStatus("error")
      onSaveFailure(result.error === "stale")
    })

    return saveQueueRef.current
  }

  function onChange(next: string): void {
    setValue(next)
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current)
    nameTimerRef.current = setTimeout(
      () => void enqueueNameSave(next),
      NAME_DEBOUNCE_MS
    )
  }

  function flush(): void {
    if (nameTimerRef.current) {
      clearTimeout(nameTimerRef.current)
      nameTimerRef.current = null
    }
    void enqueueNameSave(value)
  }

  function revert(): void {
    setValue(lastSavedNameRef.current)
  }

  function saveGeometry(geometry: MapGeometry): void {
    pendingGeometryRef.current = geometry
    if (geometryTimerRef.current) clearTimeout(geometryTimerRef.current)
    geometryTimerRef.current = setTimeout(
      () => void enqueueGeometrySave(geometry),
      GEOMETRY_DEBOUNCE_MS
    )
  }

  const flushOnUnmount = useEffectEvent(() => {
    if (nameTimerRef.current) {
      clearTimeout(nameTimerRef.current)
      void enqueueNameSave(value)
    }
    if (geometryTimerRef.current && pendingGeometryRef.current) {
      clearTimeout(geometryTimerRef.current)
      void enqueueGeometrySave(pendingGeometryRef.current)
    }
  })

  useEffect(() => () => flushOnUnmount(), [])

  return {
    name: { value, onChange, flush, revert },
    saveGeometry,
    save: { status, lastSavedAt },
  }
}
