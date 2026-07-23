"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import type { Canon } from "@workspace/headcanon"
import { err, ok } from "@workspace/result"

import {
  templateSetEvents,
  templateSetRename,
  type TemplateSetCanonValue,
  type TemplateSetEvent,
} from "@/domain/template-set/commit/protocol"
import { reduceTemplateSetEvent } from "@/domain/template-set/events"
import { useTemplateSetPredictions } from "@/domain/template-set/use-template-set-predictions"
import { mutationRecoveryToasts } from "@/lib/sync/mutation-recovery-toasts"
import { useDebouncedAutoSave } from "@/lib/sync/use-debounced-auto-save"

const DEBOUNCE_MS = 600
const TEMPLATE_SET_RECOVERY_MESSAGES = {
  delivery: "Connection lost mid-save — your set change is kept.",
  freshness: "Couldn't confirm the latest set changes.",
} as const

export type TemplateSetSaveStatus = "saved" | "saving" | "error"

type TemplateSetAutoSaveError = "change-refused" | "save-interrupted"

export function useTemplateSetAutoSave({
  templateSetId,
  canon,
}: {
  templateSetId: string
  canon: Canon<TemplateSetCanonValue>
}) {
  const root = useTemplateSetPredictions({
    canon,
    recoveryListeners: mutationRecoveryToasts({
      scope: `template-set:${templateSetId}`,
      messages: TEMPLATE_SET_RECOVERY_MESSAGES,
    }),
  })
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
      setContent(root.value.content)
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

  const syncFromRoot = useEffectEvent(() => {
    try {
      setContent(
        pendingEventsRef.current.reduce(
          reduceTemplateSetEvent,
          root.value.content
        )
      )
    } catch {
      // Keep the responsive local draft until its pending batch receives the
      // authority's explicit refusal; the failure path then restores canon.
    }
  })
  useEffect(() => syncFromRoot(), [canon, root.status.pending])

  const flushOnUnmount = useEffectEvent(() => flushEvents())
  useEffect(() => () => flushOnUnmount(), [])

  return {
    content,
    name: {
      value: name.value,
      onChange: name.setValue,
      flush: name.flush,
      revert: name.revert,
      onFocusChange: name.onFocusChange,
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
