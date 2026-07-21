"use client"

import { useRef } from "react"

import { ok, type Result } from "@workspace/result"

import {
  useDebouncedAutoSave,
  type UseDebouncedAutoSaveReturn,
} from "@/domain/entity/use-debounced-auto-save"
import { saveArticleProseAction } from "@/lib/actions/campaign-world/article-prose"
import type { SaveArticleProseError } from "@/lib/actions/campaign-world/article-prose.schema"

import { WORLD_PROSE_DEBOUNCE_MS } from "./world-prose"

/**
 * The Article page's two autosaved fields (UNN-579, D10): name and body,
 * each a {@link useDebouncedAutoSave} lifecycle over
 * `saveArticleProseAction` — which never revalidates (the tree row keeps up
 * through the shell's name mirror). The `useBeatAutoSave` composition: LWW,
 * one shared save queue serializing both fields' writes to the row, and the
 * body keeps its draft on failure.
 */
export function useArticleAutoSave({
  campaignId,
  articleId,
  serverName,
  serverBody,
}: {
  campaignId: string
  articleId: string
  serverName: string
  serverBody: string
}): {
  name: UseDebouncedAutoSaveReturn<string>
  body: UseDebouncedAutoSaveReturn<string>
} {
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  const saveField =
    (field: "name" | "body") =>
    async (
      value: string,
      options: { flush: boolean }
    ): Promise<Result<{ value: string }, SaveArticleProseError>> => {
      const result = await saveArticleProseAction({
        campaignId,
        articleId,
        [field]: value,
        revalidate: options.flush,
      })
      return result.ok ? ok({ value }) : result
    }

  return {
    name: useDebouncedAutoSave({
      serverValue: serverName,
      saveQueueRef,
      save: saveField("name"),
      debounceMs: WORLD_PROSE_DEBOUNCE_MS,
      revalidateOnFlush: true,
    }),
    body: useDebouncedAutoSave({
      serverValue: serverBody,
      saveQueueRef,
      save: saveField("body"),
      debounceMs: WORLD_PROSE_DEBOUNCE_MS,
      keepDraftOnError: true,
      revalidateOnFlush: true,
    }),
  }
}
