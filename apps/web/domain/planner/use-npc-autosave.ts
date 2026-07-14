"use client"

import { ok, type Result } from "@workspace/game-v2/kernel/result"
import type { NarrativeTextField } from "@workspace/game-v2/narrative"

import {
  useDebouncedAutoSave,
  type UseDebouncedAutoSaveReturn,
} from "@/domain/entity/use-debounced-auto-save"
import {
  saveNpcNameAction,
  saveNpcNarrativeAction,
} from "@/lib/actions/campaign-world/npc-prose"
import type { NpcProseError } from "@/lib/actions/campaign-world/npc-prose.schema"

import { WORLD_PROSE_DEBOUNCE_MS } from "./world-prose"

/**
 * The NPC page's autosave lanes (UNN-579, D10): the name header and one
 * narrative field pane, both LWW over the `npc-prose` actions (no
 * revalidation; the tree row keeps up through the shell's name mirror).
 *
 * Unlike the beat hook's fixed trio, the narrative pane mounts **one field
 * at a time** (the animus one-document-at-a-time experience), so these are
 * two hooks sharing the page's save queue: the page calls
 * {@link useNpcNameAutoSave} once and the mounted pane calls
 * {@link useNpcNarrativeAutoSave} keyed by field. One queue still serializes
 * every write to the entity row — the per-field server merge handles the
 * rest.
 */
export function useNpcNameAutoSave({
  campaignId,
  entityId,
  serverName,
  saveQueueRef,
}: {
  campaignId: string
  entityId: string
  serverName: string
  saveQueueRef: React.RefObject<Promise<void>>
}): UseDebouncedAutoSaveReturn<string> {
  return useDebouncedAutoSave({
    serverValue: serverName,
    saveQueueRef,
    dispatchWrite: lwwDispatch,
    save: async (value, _expectedVersion, options) => {
      const result = await saveNpcNameAction({
        campaignId,
        entityId,
        name: value,
        revalidate: options.flush,
      })
      return result.ok ? ok({ value, version: 0 }) : result
    },
    debounceMs: WORLD_PROSE_DEBOUNCE_MS,
    revalidateOnFlush: true,
  })
}

/** One narrative field's autosave — mount keyed by `field`. Drafts survive failures. */
export function useNpcNarrativeAutoSave({
  campaignId,
  entityId,
  field,
  serverValue,
  saveQueueRef,
}: {
  campaignId: string
  entityId: string
  field: NarrativeTextField
  serverValue: string
  saveQueueRef: React.RefObject<Promise<void>>
}): UseDebouncedAutoSaveReturn<string> {
  return useDebouncedAutoSave({
    serverValue,
    saveQueueRef,
    dispatchWrite: lwwDispatch,
    save: async (value, _expectedVersion, options) => {
      const result = await saveNpcNarrativeAction({
        campaignId,
        entityId,
        field,
        value,
        revalidate: options.flush,
      })
      return result.ok ? ok({ value, version: 0 }) : result
    },
    debounceMs: WORLD_PROSE_DEBOUNCE_MS,
    keepDraftOnError: true,
    revalidateOnFlush: true,
  })
}

const lwwDispatch = (
  action: (
    expectedVersion: number
  ) => Promise<Result<{ value: string; version: number }, NpcProseError>>
) => action(0)
