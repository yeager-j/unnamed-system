"use client"

import { useEffect, useRef, type RefObject } from "react"

/**
 * Holds the latest known per-write-class version token for a character in a
 * mutable ref, kept in sync with the server-supplied prop. The shape every
 * optimistic-action editor needs: read the current token synchronously
 * before dispatching a save (`ref.current`), and overwrite the ref from the
 * server's response on success so a rapid follow-up save sees the fresh
 * value without waiting for React commit + effects to propagate the new
 * prop. This hook is the one place that prop-sync pattern lives — every
 * click-action editor on the sheet (UNN-180-style) should consume it
 * instead of hand-rolling the ref-plus-effect pair.
 *
 * The debounced text editors (`useDebouncedAutoSave`) read the *same* ref
 * this hook produces — handed to them by the provider via
 * `useCharacterVersionRef(surface)` / `useBuilderVersionRef()` (UNN-274) — so
 * same-class fields coordinate on one token. This hook's prop-sync remains
 * the fallback that absorbs cross-tab / external version bumps.
 */
export function useCharacterTokenRef<T>(token: T): RefObject<T> {
  const ref = useRef(token)
  useEffect(() => {
    ref.current = token
  }, [token])
  return ref
}
