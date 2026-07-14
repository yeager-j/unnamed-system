"use client"

import { useCallback, useEffect, useSyncExternalStore } from "react"

import { getParticipantPreviewAction } from "@/lib/actions/campaign-world/participant-preview"

import type { ParticipantKind, ParticipantRef } from "./participant"
import type { ParticipantPreview } from "./participant-preview"

/**
 * The hover cache's cap — past it the oldest entry is evicted, so a long DM
 * session hovering its way through a chip-dense chronicle can't grow the map
 * without bound. The vendored wiki-link resolver draws the same line at 600
 * cheap `{target → name}` entries; a preview is heavier and hovered far less.
 */
const MAX_CACHED_PREVIEWS = 200

/** A settled lookup: the payload, or `null` for a ref that resolved to nothing. */
type SettledPreview = ParticipantPreview | null

const settled = new Map<string, SettledPreview>()
const inFlight = new Map<string, Promise<SettledPreview>>()
const listeners = new Set<() => void>()

/**
 * The client-side preview loader shared by both hover halves (UNN-622): the
 * display path's pill (through {@link useParticipantPreview}) and the editor's
 * CM6 hover bridge, which lives outside React and calls this directly. One
 * fetch per target ever — a settled payload is cached (bounded, FIFO-evicted)
 * and concurrent hovers of the same target share one in-flight promise.
 *
 * A failed fetch settles as `null` (the card says "not found") rather than
 * throwing: a preview is an enhancement, never a page break.
 */
export async function fetchParticipantPreview(
  campaignId: string,
  ref: ParticipantRef
): Promise<SettledPreview> {
  const key = previewKey(campaignId, ref.kind, ref.id)
  const cached = settled.get(key)
  if (cached !== undefined) return cached

  const pending = inFlight.get(key)
  if (pending !== undefined) return pending

  const request = getParticipantPreviewAction({
    campaignId,
    ref: { kind: ref.kind, id: ref.id },
  })
    .then((result) => (result.ok ? result.value : null))
    .catch(() => null)
    .then((preview) => {
      inFlight.delete(key)
      remember(key, preview)
      return preview
    })

  inFlight.set(key, request)
  return request
}

/** What a hover card renders while, and after, its payload resolves. */
export type ParticipantPreviewState =
  | { status: "loading" }
  | { status: "ready"; preview: ParticipantPreview }
  | { status: "missing" }

/**
 * The display path's hover fetch — the cache read as an external store, so a
 * card that opens on an already-fetched target renders it in the first frame
 * with no loading flash. `enabled` is the card's open state: the fetch fires
 * when the card opens, so the card's own open delay *is* the debounce, and a
 * pointer sweeping across a line of chips fetches none of them.
 */
export function useParticipantPreview(
  campaignId: string,
  kind: ParticipantKind,
  id: string,
  enabled: boolean
): ParticipantPreviewState {
  const key = previewKey(campaignId, kind, id)
  const preview = useSyncExternalStore(
    subscribeToPreviews,
    useCallback(() => settled.get(key), [key]),
    () => undefined
  )

  useEffect(() => {
    if (!enabled) return
    void fetchParticipantPreview(campaignId, { kind, id })
  }, [campaignId, kind, id, enabled])

  return stateOf(preview)
}

function subscribeToPreviews(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

function stateOf(preview: SettledPreview | undefined): ParticipantPreviewState {
  if (preview === undefined) return { status: "loading" }
  return preview === null ? { status: "missing" } : { status: "ready", preview }
}

function remember(key: string, preview: SettledPreview): void {
  settled.set(key, preview)
  if (settled.size > MAX_CACHED_PREVIEWS) {
    const oldest = settled.keys().next()
    if (!oldest.done) settled.delete(oldest.value)
  }
  for (const listener of listeners) listener()
}

function previewKey(
  campaignId: string,
  kind: ParticipantKind,
  id: string
): string {
  return `${campaignId}:${kind}:${id}`
}
