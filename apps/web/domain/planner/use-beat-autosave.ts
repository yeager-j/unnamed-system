"use client"

import { useRef } from "react"

import { ok, type Result } from "@workspace/game-v2/kernel/result"

import {
  useDebouncedAutoSave,
  type UseDebouncedAutoSaveReturn,
} from "@/domain/entity/use-debounced-auto-save"
import { saveBeatProseAction } from "@/lib/actions/campaign-notes/prose"
import type { SaveBeatProseError } from "@/lib/actions/campaign-notes/prose.schema"

/** The beat editor's autosave debounce (D10's ~800 ms; map uses 600, entity fields 500). */
const BEAT_DEBOUNCE_MS = 800

/**
 * The beat editor's three autosaved fields (UNN-576, D10): title, tagline,
 * and body, each a {@link useDebouncedAutoSave} lifecycle (draft, debounce,
 * flush-on-blur, unmount flush) over `saveBeatProseAction` — which never
 * revalidates; the server action re-derives the mention index when the body
 * lands.
 *
 * **LWW composition.** A `campaignBeat` carries no version column (D6: prose
 * is last-write-wins), so there is no token to thread and no `"stale"` to
 * retry: `dispatchWrite` just runs the action, and the constant version
 * satisfies the hook's CAS-shaped contract without inventing a counter
 * nothing reads. What still matters is ordering — all three fields share
 * **one save queue**, serializing every write to the row so a body save's
 * mention re-derive never interleaves with a title save.
 *
 * The **body keeps its draft on failure** (`keepDraftOnError` — a paragraph
 * must survive a network blip; the next debounce/blur retries); title and
 * tagline keep the default rollback, like every other one-line field.
 */
export function useBeatAutoSave({
  campaignId,
  beatId,
  serverTitle,
  serverTagline,
  serverBody,
}: {
  campaignId: string
  beatId: string
  serverTitle: string
  serverTagline: string
  serverBody: string
}): {
  title: UseDebouncedAutoSaveReturn<string>
  tagline: UseDebouncedAutoSaveReturn<string>
  body: UseDebouncedAutoSaveReturn<string>
} {
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const saveField =
    (field: "title" | "tagline" | "body") =>
    async (
      value: string,
      _expectedVersion: number,
      options: { flush: boolean }
    ): Promise<
      Result<{ value: string; version: number }, SaveBeatProseError>
    > => {
      const result = await saveBeatProseAction({
        campaignId,
        beatId,
        [field]: value,
        revalidate: options.flush,
      })
      return result.ok ? ok({ value, version: 0 }) : result
    }

  const lwwDispatch = (
    action: (
      expectedVersion: number
    ) => Promise<Result<{ value: string; version: number }, SaveBeatProseError>>
  ) => action(0)

  return {
    title: useDebouncedAutoSave({
      serverValue: serverTitle,
      saveQueueRef,
      dispatchWrite: lwwDispatch,
      save: saveField("title"),
      debounceMs: BEAT_DEBOUNCE_MS,
      revalidateOnFlush: true,
    }),
    tagline: useDebouncedAutoSave({
      serverValue: serverTagline,
      saveQueueRef,
      dispatchWrite: lwwDispatch,
      save: saveField("tagline"),
      debounceMs: BEAT_DEBOUNCE_MS,
      revalidateOnFlush: true,
    }),
    body: useDebouncedAutoSave({
      serverValue: serverBody,
      saveQueueRef,
      dispatchWrite: lwwDispatch,
      save: saveField("body"),
      debounceMs: BEAT_DEBOUNCE_MS,
      keepDraftOnError: true,
      revalidateOnFlush: true,
    }),
  }
}
