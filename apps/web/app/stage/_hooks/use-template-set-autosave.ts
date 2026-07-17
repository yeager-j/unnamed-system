"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import { ok } from "@workspace/result"

import type { TemplateSetContent } from "@/domain/template-set/authoring"
import { saveTemplateSetAction } from "@/lib/actions/template-set/save"
import { useQueuedWrite } from "@/lib/sync/use-queued-write"

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
 * content) — the no-Save-button editor. The Set's **name and content share one
 * `version` token** (`templateSet.version`), so they must round-trip it through
 * **one** version ref and **one** serialized queue: two independent refs would
 * false-`stale` each other when a name edit and a template edit land back-to-back.
 *
 * That serialized version-token queue is not hand-rolled here: both fields route
 * their saves through one {@link useQueuedWrite} — the single-row façade over the
 * shared `createWriteQueue` core (`lib/sync/write-queue.ts`). It owns the
 * monotonic version ref (synced from `serverVersion`), the serialized spine, and
 * the forward-only token bump. `refetchVersion` is **omitted** on purpose: the Set
 * does *not* do the character autosave's silent refetch-and-retry — a `"stale"`
 * just reverts/toasts (see `saveTemplateSetAction`).
 *
 * This hook keeps only the per-field lifecycle glue. The name keeps its own draft
 * `value` + revert-on-failure (the field's server value is authoritative).
 * **Content does not hard-revert on failure:** each save persists the *whole*
 * `content` blob, so a transient failure self-heals on the next edit, and
 * discarding a library of work on a blip is worse than keeping it — a failure
 * toasts (refresh-prompt on `"stale"`) and leaves the local edits in place. Name
 * and content debounce on **independent timers** (a keystroke must not cancel a
 * pending template-edit save) but serialize through the one queue, each reading the
 * freshly-bumped token inside the chain. Both flush on unmount so a client-side
 * nav mid-debounce doesn't drop the last edit.
 *
 * Unlike the Map hook, no `serverContent` is threaded: the editor owns the
 * `content` state and hands the whole re-derived blob to `saveContent`, so the
 * last-saved no-op skip primes off the first successful save rather than the server
 * baseline.
 */
export function useTemplateSetAutoSave({
  templateSetId,
  serverName,
  serverVersion,
}: {
  templateSetId: string
  serverName: string
  serverVersion: number
}) {
  const { enqueue } = useQueuedWrite({ serverVersion })
  const [value, setValue] = useState(serverName)
  const [status, setStatus] = useState<TemplateSetSaveStatus>("saved")
  const [lastSavedAt, setLastSavedAt] = useState<number | null>(null)
  const lastSavedNameRef = useRef(serverName)
  const lastSavedContentRef = useRef<string | null>(null)
  const pendingContentRef = useRef<TemplateSetContent | null>(null)
  const nameTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const contentTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  function onSaveFailure(stale: boolean): void {
    toast.error(
      stale
        ? "Couldn't sync the set — refresh to see the latest changes."
        : "Couldn't save the set. Try again."
    )
  }

  function enqueueNameSave(next: string): void {
    const trimmed = next.trim()

    void enqueue(async (expectedVersion) => {
      if (trimmed.length === 0 || trimmed === lastSavedNameRef.current.trim())
        return ok({ version: expectedVersion })

      setStatus("saving")
      const result = await saveTemplateSetAction({
        templateSetId,
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

  function enqueueContentSave(content: TemplateSetContent): void {
    pendingContentRef.current = null

    void enqueue(async (expectedVersion) => {
      const serialized = JSON.stringify(content)
      if (serialized === lastSavedContentRef.current)
        return ok({ version: expectedVersion })

      setStatus("saving")
      const result = await saveTemplateSetAction({
        templateSetId,
        expectedVersion,
        patch: { field: "content", content },
      })
      if (result.ok) {
        lastSavedContentRef.current = serialized
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
