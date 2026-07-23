"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import type { MapGeometryEvent } from "@workspace/game-v2/spatial"
import type { Canon } from "@workspace/headcanon"
import { err, ok } from "@workspace/result"

import { useDebouncedAutoSave } from "@/domain/entity/use-debounced-auto-save"
import {
  mapGeometryEvents,
  mapRename,
  reduceMapGeometryEvents,
  type MapCanonValue,
} from "@/domain/map/commit/protocol"
import { useMapPredictions } from "@/domain/map/use-map-predictions"

const DEBOUNCE_MS = 600

export type MapSaveStatus = "saved" | "saving" | "error"

type MapAutoSaveError = "change-refused" | "save-interrupted"

export function useMapAutoSave({
  mapId,
  canon,
}: {
  mapId: string
  canon: Canon<MapCanonValue>
}) {
  const root = useMapPredictions({ canon })
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

  const syncFromCanon = useEffectEvent(() => {
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
  useEffect(() => syncFromCanon(), [canon])

  useEffect(() => {
    if (root.status.delivery === "uncertain") {
      toast.error("Connection lost mid-save — your map change is kept.", {
        id: `map-delivery-uncertain:${mapId}`,
        duration: Infinity,
        action: { label: "Retry", onClick: root.retryDelivery },
      })
    } else {
      toast.dismiss(`map-delivery-uncertain:${mapId}`)
    }
  }, [mapId, root.retryDelivery, root.status.delivery])

  useEffect(() => {
    if (root.status.freshness === "stalled") {
      toast.error("Couldn't confirm the latest map changes.", {
        id: `map-refresh-stalled:${mapId}`,
        duration: Infinity,
        action: { label: "Refresh", onClick: root.retryRefresh },
      })
    } else {
      toast.dismiss(`map-refresh-stalled:${mapId}`)
    }
  }, [mapId, root.retryRefresh, root.status.freshness])

  const flushOnUnmount = useEffectEvent(() => flushGeometryEvents())
  useEffect(() => () => flushOnUnmount(), [])

  return {
    name: {
      value: name.value,
      onChange: name.setValue,
      flush: name.flush,
      revert: name.revert,
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
