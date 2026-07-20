"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import type { TemplateSetContent } from "@/domain/template-set/authoring"
import { saveTemplateSetAction } from "@/lib/actions/template-set/save"

import { useSerializeLatest } from "./use-serialize-latest"

const NAME_DEBOUNCE_MS = 600
const CONTENT_DEBOUNCE_MS = 600

/**
 * The editor's save indicator state: `saved` once the server has the latest edit,
 * `saving` while a write is in flight, `error` after a failed write (the local
 * edits stay; see the content note above).
 */
export type TemplateSetSaveStatus = "saved" | "saving" | "error"

/**
 * Debounced auto-save coordinator for the Template Set editor (UNN-588 name +
 * content) — the no-Save-button editor. Set authoring is deliberately per-field
 * last-writer-wins: each action updates only `name` or `content`, and cross-tab
 * edits by the single owner resolve by whichever field write lands last. Within
 * this editor, both fields share {@link useSerializeLatest}, so a slow save
 * cannot be overtaken and repeated edits to one waiting field collapse to its
 * newest value.
 *
 * This hook keeps only the per-field lifecycle glue. The name keeps its own draft
 * `value` + revert-on-failure (the field's server value is authoritative).
 * **Content does not hard-revert on failure:** each save persists the *whole*
 * `content` blob, so a transient failure self-heals on the next edit, and
 * discarding a library of work on a blip is worse than keeping it — a failure
 * toasts and leaves the local edits in place. Name
 * and content debounce on **independent timers** (a keystroke must not cancel a
 * pending template-edit save) but serialize through one save spine. Both flush
 * on unmount so a client-side nav mid-debounce doesn't drop the last edit.
 *
 * Unlike the Map hook, no `serverContent` is threaded: the editor owns the
 * `content` state and hands the whole re-derived blob to `saveContent`, so the
 * last-saved no-op skip primes off the first successful save rather than the server
 * baseline.
 */
export function useTemplateSetAutoSave({
  templateSetId,
  serverName,
}: {
  templateSetId: string
  serverName: string
}) {
  const [value, setValue] = useState(serverName)
  const [status, setStatus] = useState<TemplateSetSaveStatus>("saved")
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const serializeLatest = useSerializeLatest((error) => {
    console.error("[useTemplateSetAutoSave] save threw", error)
    setStatus("error")
    onSaveFailure()
  })
  const lastSavedNameRef = useRef(serverName)
  const currentNameRef = useRef(serverName)
  const lastSavedContentRef = useRef<string | null>(null)
  const pendingContentRef = useRef<TemplateSetContent | null>(null)
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onSaveFailure(): void {
    toast.error("Couldn't save the set. Try again.")
  }

  function enqueueNameSave(next: string): void {
    const trimmed = next.trim()

    serializeLatest("name", async () => {
      if (trimmed.length === 0 || trimmed === lastSavedNameRef.current.trim())
        return

      setStatus("saving")
      const result = await saveTemplateSetAction({
        templateSetId,
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

  function enqueueContentSave(content: TemplateSetContent): void {
    pendingContentRef.current = null

    serializeLatest("content", async () => {
      const serialized = JSON.stringify(content)
      if (serialized === lastSavedContentRef.current) return

      setStatus("saving")
      const result = await saveTemplateSetAction({
        templateSetId,
        patch: { field: "content", content },
      })
      if (result.ok) {
        lastSavedContentRef.current = serialized
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

  function saveContent(content: TemplateSetContent): void {
    pendingContentRef.current = content
    if (contentTimerRef.current) clearTimeout(contentTimerRef.current)
    contentTimerRef.current = setTimeout(
      () => enqueueContentSave(content),
      CONTENT_DEBOUNCE_MS
    )
  }

  const flushOnUnmount = useEffectEvent(() => {
    if (nameTimerRef.current) {
      clearTimeout(nameTimerRef.current)
      enqueueNameSave(value)
    }
    if (contentTimerRef.current && pendingContentRef.current) {
      clearTimeout(contentTimerRef.current)
      enqueueContentSave(pendingContentRef.current)
    }
  })

  useEffect(() => () => flushOnUnmount(), [])

  return {
    name: { value, onChange, flush, revert },
    saveContent,
    save: { status, lastSavedAt },
  }
}
