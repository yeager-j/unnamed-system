"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import type { Canon } from "@workspace/headcanon"
import { err, ok } from "@workspace/result"

import { useDebouncedAutoSave } from "@/domain/entity/use-debounced-auto-save"
import {
  templateSetEvents,
  templateSetRename,
  type TemplateSetCanonValue,
  type TemplateSetEvent,
} from "@/domain/template-set/commit/protocol"
import { reduceTemplateSetEvent } from "@/domain/template-set/events"
import { useTemplateSetPredictions } from "@/domain/template-set/use-template-set-predictions"

const DEBOUNCE_MS = 600

export type TemplateSetSaveStatus = "saved" | "saving" | "error"

type TemplateSetAutoSaveError = "change-refused" | "save-interrupted"

export function useTemplateSetAutoSave({
  templateSetId,
  canon,
}: {
  templateSetId: string
  canon: Canon<TemplateSetCanonValue>
}) {
  const root = useTemplateSetPredictions({ canon })
  const [content, setContent] = useState(canon.value.content)
  const [settledStatus, setSettledStatus] =
    useState<TemplateSetSaveStatus>("saved")
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const eventTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const pendingEventsRef = useRef<TemplateSetEvent[]>([])

  function surfaceFailure(error: TemplateSetAutoSaveError): void {
    setSettledStatus("error")
    toast.error(
      error === "change-refused"
        ? "The set changed elsewhere, so that edit couldn't be applied."
        : "Couldn't save the set. Try again."
    )
  }

  const name = useDebouncedAutoSave<string, TemplateSetAutoSaveError>({
    serverValue: canon.value.name,
    debounceMs: DEBOUNCE_MS,
    isEmpty: (value) => value.trim().length === 0,
    isEqual: (left, right) => left.trim() === right.trim(),
    onError: surfaceFailure,
    async save(value) {
      setSettledStatus("saving")
      const trimmed = value.trim()
      const mutation = root.mutate(
        templateSetRename({ templateSetId, name: trimmed })
      )
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

  function flushEvents(): void {
    if (eventTimerRef.current) {
      clearTimeout(eventTimerRef.current)
      eventTimerRef.current = null
    }
    const events = pendingEventsRef.current
    if (events.length === 0) return
    pendingEventsRef.current = []

    setSettledStatus("saving")
    const mutation = root.mutate(templateSetEvents({ templateSetId, events }))
    if (!mutation.ok) {
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

  function applyEvent(event: TemplateSetEvent): void {
    setContent((current) => reduceTemplateSetEvent(current, event))
    pendingEventsRef.current.push(event)
    if (eventTimerRef.current) clearTimeout(eventTimerRef.current)
    eventTimerRef.current = setTimeout(flushEvents, DEBOUNCE_MS)
  }

  const syncFromCanon = useEffectEvent(() => {
    setContent(
      pendingEventsRef.current.reduce(
        reduceTemplateSetEvent,
        root.value.content
      )
    )
  })
  useEffect(() => syncFromCanon(), [canon])

  useEffect(() => {
    if (root.status.delivery === "uncertain") {
      toast.error("Connection lost mid-save — your set change is kept.", {
        id: `template-set-delivery-uncertain:${templateSetId}`,
        duration: Infinity,
        action: { label: "Retry", onClick: root.retryDelivery },
      })
    } else {
      toast.dismiss(`template-set-delivery-uncertain:${templateSetId}`)
    }
  }, [root.retryDelivery, root.status.delivery, templateSetId])

  useEffect(() => {
    if (root.status.freshness === "stalled") {
      toast.error("Couldn't confirm the latest set changes.", {
        id: `template-set-refresh-stalled:${templateSetId}`,
        duration: Infinity,
        action: { label: "Refresh", onClick: root.retryRefresh },
      })
    } else {
      toast.dismiss(`template-set-refresh-stalled:${templateSetId}`)
    }
  }, [root.retryRefresh, root.status.freshness, templateSetId])

  const flushOnUnmount = useEffectEvent(() => flushEvents())
  useEffect(() => () => flushOnUnmount(), [])

  return {
    content,
    name: {
      value: name.value,
      onChange: name.setValue,
      flush: name.flush,
      revert: name.revert,
    },
    applyEvent,
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
