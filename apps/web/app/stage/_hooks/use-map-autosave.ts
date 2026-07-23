"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import type { MapGeometryEvent } from "@workspace/game-v2/spatial"
import type { Canon } from "@workspace/headcanon"
import { err, ok } from "@workspace/result"

import {
  mapGeometryEvents,
  mapRename,
  reduceMapGeometryEvents,
  type MapCanonValue,
} from "@/domain/map/commit/protocol"
import { useMapPredictions } from "@/domain/map/use-map-predictions"
import { mutationRecoveryToasts } from "@/lib/sync/mutation-recovery-toasts"
import { useDebouncedAutoSave } from "@/lib/sync/use-debounced-auto-save"

const DEBOUNCE_MS = 600
const MAP_RECOVERY_MESSAGES = {
  delivery: "Connection lost mid-save — your map change is kept.",
  freshness: "Couldn't confirm the latest map changes.",
} as const

export type MapSaveStatus = "saved" | "saving" | "error"

type MapAutoSaveError = "change-refused" | "save-interrupted"

export function useMapAutoSave({
  mapId,
  canon,
}: {
  mapId: string
  canon: Canon<MapCanonValue>
}) {
  const root = useMapPredictions({
    canon,
    recoveryListeners: mutationRecoveryToasts({
      scope: `map:${mapId}`,
      messages: MAP_RECOVERY_MESSAGES,
    }),
  })
  const [geometry, setGeometry] = useState(canon.value.geometry)
  const [settledStatus, setSettledStatus] = useState<MapSaveStatus>("saved")
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const geometryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingGeometryEventsRef = useRef<MapGeometryEvent[]>([])

  function surfaceFailure(error: MapAutoSaveError): void {
    setSettledStatus("error")
    toast.error(
      error === "change-refused"
        ? "The map changed elsewhere, so that edit couldn't be applied."
        : "Couldn't save the map. Try again."
    )
  }

  const name = useDebouncedAutoSave<string, MapAutoSaveError>({
    serverValue: canon.value.name,
    debounceMs: DEBOUNCE_MS,
    isEmpty: (value) => value.trim().length === 0,
    isEqual: (left, right) => left.trim() === right.trim(),
    onError: surfaceFailure,
    async save(value) {
      setSettledStatus("saving")
      const trimmed = value.trim()
      const mutation = root.mutate(mapRename({ mapId, name: trimmed }))
      if (!mutation.ok) return err("change-refused")

      const accepted = await mutation.value.accepted
      if (!accepted.ok) {
        return err(
          accepted.error.kind === "domain" ||
            accepted.error.kind === "replay-refused"
            ? "change-refused"
            : "save-interrupted"
        )
      }

      setSettledStatus("saved")
      setLastSavedAt(Date.now())
      return ok({ value: trimmed })
    },
  })

  function flushGeometryEvents(): void {
    if (geometryTimerRef.current) {
      clearTimeout(geometryTimerRef.current)
      geometryTimerRef.current = null
    }
    const events = pendingGeometryEventsRef.current
    if (events.length === 0) return
    pendingGeometryEventsRef.current = []

    setSettledStatus("saving")
    const mutation = root.mutate(mapGeometryEvents({ mapId, events }))
    if (!mutation.ok) {
      setGeometry(root.value.geometry)
      surfaceFailure("change-refused")
      return
    }
    void mutation.value.accepted.then((accepted) => {
      if (!accepted.ok) {
        if (
          accepted.error.kind === "domain" ||
          accepted.error.kind === "replay-refused"
        ) {
          surfaceFailure("change-refused")
        }
        return
      }
      setSettledStatus("saved")
      setLastSavedAt(Date.now())
    })
  }

  function saveGeometryEvent(
    event: MapGeometryEvent,
    nextGeometry?: MapCanonValue["geometry"]
  ): void {
    setGeometry(
      (current) => nextGeometry ?? reduceMapGeometryEvents(current, [event])
    )
    pendingGeometryEventsRef.current.push(event)
    if (geometryTimerRef.current) clearTimeout(geometryTimerRef.current)
    geometryTimerRef.current = setTimeout(flushGeometryEvents, DEBOUNCE_MS)
  }

  const syncFromRoot = useEffectEvent(() => {
    try {
      setGeometry(
        reduceMapGeometryEvents(
          root.value.geometry,
          pendingGeometryEventsRef.current
        )
      )
    } catch {
      // Keep the responsive local draft until its pending batch receives the
      // authority's explicit refusal; the failure path then restores canon.
    }
  })
  useEffect(() => syncFromRoot(), [canon, root.status.pending])

  const flushOnUnmount = useEffectEvent(() => flushGeometryEvents())
  useEffect(() => () => flushOnUnmount(), [])

  return {
    name: {
      value: name.value,
      onChange: name.setValue,
      flush: name.flush,
      revert: name.revert,
      onFocusChange: name.onFocusChange,
    },
    geometry,
    saveGeometryEvent,
    save: {
      status:
        root.status.delivery === "uncertain"
          ? ("error" as const)
          : root.status.pending > 0
            ? ("saving" as const)
            : settledStatus,
      lastSavedAt,
    },
  }
}
