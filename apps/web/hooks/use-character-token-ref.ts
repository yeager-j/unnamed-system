"use client"

import { type RefObject } from "react"

import { useMonotonicVersionRef } from "./use-monotonic-version-ref"

/**
 * Holds the latest known per-write-class version token for a character in a
 * mutable ref, kept in sync **forward-only** with the server-supplied prop. The
 * shape every optimistic-action editor needs: read the current token
 * synchronously before dispatching a save (`ref.current`), and overwrite the ref
 * from the server's response on success so a rapid follow-up save sees the fresh
 * value without waiting for React commit + effects to propagate the new prop.
 * This hook is the one place that prop-sync pattern lives — every click-action
 * editor on the sheet (UNN-180-style) should consume it instead of hand-rolling
 * the ref-plus-effect pair.
 *
 * The sync is **monotonic** ({@link useMonotonicVersionRef}, UNN-378): version
 * tokens only ever increment, so a prop arriving *lower* than the ref is a stale
 * render frame (a `router.refresh()` still in flight) and must not roll the ref
 * back below a token a write or a cross-tab broadcast already advanced it to —
 * the invariant `mergePingedVersions` documents.
 *
 * The debounced text editors read the *same* ref this hook produces — handed
 * to them by the provider-bound wrappers `useCharacterAutoSave` /
 * `useBuilderAutoSave` (UNN-274) — so same-class fields coordinate on one
 * token. This hook's prop-sync remains the fallback that absorbs cross-tab /
 * external version bumps.
 */
export function useCharacterTokenRef(token: number): RefObject<number> {
  return useMonotonicVersionRef(token)
}
