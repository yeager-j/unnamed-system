"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import type { MapGeometry } from "@workspace/game-v2/spatial"
import { ok } from "@workspace/result"

import { saveMapAction } from "@/lib/actions/save-map"
import { useQueuedWrite } from "@/lib/sync/use-queued-write"

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
 * version ref and **one** serialized queue: two independent refs would
 * false-`stale` each other when a name edit and a node drag land back-to-back.
 *
 * That serialized version-token queue is not hand-rolled here (UNN-483): both
 * fields route their saves through one {@link useQueuedWrite} — the single-row
 * façade over the shared `createWriteQueue` core (`lib/sync/write-queue.ts`). It
 * owns the monotonic version ref (synced from `serverVersion`), the serialized
 * spine, and the forward-only token bump. `refetchVersion` is **omitted** on
 * purpose: the Map does *not* do the character autosave's silent
 * refetch-and-retry — a `"stale"` just reverts/toasts (see `saveMapAction`).
 *
 * This hook keeps only the per-field lifecycle glue. The name keeps its own draft
 * `value` + revert-on-failure (the field's server value is authoritative).
 * **Geometry does not hard-revert on failure:** each save persists the *whole*
 * `geometry` blob, so a transient failure self-heals on the next edit, and
 * discarding a canvas of work on a blip is worse than keeping it — a failure
 * toasts (refresh-prompt on `"stale"`) and leaves the local edits in place. Name
 * and geometry debounce on **independent timers** (a keystroke must not cancel a
 * pending node-drag save) but serialize through the one queue, each reading the
 * freshly-bumped token inside the chain. Both flush on unmount so a client-side
 * nav mid-debounce doesn't drop the last edit.
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
  const { enqueue } = useQueuedWrite({ serverVersion })
  const [value, setValue] = useState(serverName)
  const [status, setStatus] = useState<MapSaveStatus>("saved")
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const lastSavedNameRef = useRef(serverName)
  const lastSavedGeometryRef = useRef(JSON.stringify(serverGeometry))
  const pendingGeometryRef = useRef<MapGeometry | null>(null)
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const geometryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onSaveFailure(stale: boolean): void {
    toast.error(
      stale
        ? "Couldn't sync the map — refresh to see the latest changes."
        : "Couldn't save the map. Try again."
    )
  }

  function enqueueNameSave(next: string): void {
    const trimmed = next.trim()

    void enqueue(async (expectedVersion) => {
      if (trimmed.length === 0 || trimmed === lastSavedNameRef.current.trim())
        return ok({ version: expectedVersion })

      setStatus("saving")
      const result = await saveMapAction({
        mapId,
        expectedVersion,
        patch: { field: "name", name: trimmed },
      })
      if (result.ok) {
        lastSavedNameRef.current = trimmed
        setStatus("saved")
        setLastSavedAt(Date.now())
        return result
      }
      setValue(lastSavedNameRef.current)
      setStatus("error")
      onSaveFailure(result.error === "stale")
      return result
    })
  }

  function enqueueGeometrySave(geometry: MapGeometry): void {
    pendingGeometryRef.current = null

    void enqueue(async (expectedVersion) => {
      const serialized = JSON.stringify(geometry)
      if (serialized === lastSavedGeometryRef.current)
        return ok({ version: expectedVersion })

      setStatus("saving")
      const result = await saveMapAction({
        mapId,
        expectedVersion,
        patch: { field: "geometry", geometry },
      })
      if (result.ok) {
        lastSavedGeometryRef.current = serialized
        setStatus("saved")
        setLastSavedAt(Date.now())
        return result
      }
      setStatus("error")
      onSaveFailure(result.error === "stale")
      return result
    })
  }

  function onChange(next: string): void {
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
