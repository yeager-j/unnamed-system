"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import type { Result } from "@/lib/game/result"

/**
 * Debounced auto-save lifecycle for a free-text owner-mode field. Every
 * UNN-180 pattern free-text consumer (name, notes, ancestry, background,
 * per-knife/chain titles, …) needs the same plumbing: a local draft state,
 * a debounce timeout, an in-flight guard so the debounce-then-blur pattern
 * doesn't double-fire with the same `expectedUpdatedAt`, a `lastSavedRef`
 * to skip no-op edits, and an `updatedAtRef` with two convergent writers
 * (own-action success + prop sync) so sibling components don't leave us
 * with a stale version token. This hook is the one place those rules live.
 *
 * **Concurrency contract.** The `save` callback receives the current value
 * *and* the latest known `updatedAt` — the hook does not let the consumer
 * thread the token itself, because every place I've seen consumers do that
 * has eventually drifted from the prop. On success, the hook updates the
 * ref from `result.value.updatedAt` immediately, so a rapid follow-up save
 * doesn't have to wait for React commit + effect to propagate the prop.
 *
 * **Trimming + idempotence are the consumer's job inside `save`.** The
 * hook only checks reference equality for in-flight / last-saved skips, so
 * a consumer that trims (`name`) should trim before comparing against
 * the server's stored value too. Use `isEqual` to override.
 *
 * On failure: rolls the draft back to the last-saved value and surfaces a
 * Sonner toast — `"stale"` gets a refresh-prompt, anything else gets a
 * generic "couldn't save." Override copy via `onError`.
 */

export interface UseDebouncedAutoSaveArgs<TValue, TError extends string> {
  /** The current value from the server. Drives the initial draft and the
   *  rollback target on failure. */
  serverValue: TValue
  /** The version token from the server. */
  serverUpdatedAt: Date
  /** Persists `value`, conditioned on `expectedUpdatedAt`. */
  save: (
    value: TValue,
    expectedUpdatedAt: Date
  ) => Promise<Result<{ value: TValue; updatedAt: Date }, TError>>
  /** Defaults to 500ms — the Notion-feel sweet spot. */
  debounceMs?: number
  /** Skip the save when this returns true. Default: never skip. */
  isEmpty?: (value: TValue) => boolean
  /** Used for `value === lastSaved` and `value === inFlight` short-circuits.
   *  Default: reference equality. */
  isEqual?: (a: TValue, b: TValue) => boolean
  /** Override the default Sonner toast. */
  onError?: (error: TError) => void
}

export interface UseDebouncedAutoSaveReturn<TValue> {
  /** The current draft value — bind this to the input's `value`. */
  value: TValue
  /** Updates the draft and schedules a debounced save. */
  setValue: (next: TValue) => void
  /** Cancels any pending debounce and saves the current draft now. */
  flush: () => void
  /** Discards the draft and restores it to the last-saved value. */
  revert: () => void
  /** Call from the input's `onFocus`/`onBlur` so the hook knows when to
   *  re-sync the draft from a fresh `serverValue` prop (it pauses sync
   *  while the user is mid-edit). On blur, also flushes. */
  onFocusChange: (focused: boolean) => void
}

export function useDebouncedAutoSave<TValue, TError extends string>({
  serverValue,
  serverUpdatedAt,
  save,
  debounceMs = 500,
  isEmpty = () => false,
  isEqual = Object.is,
  onError,
}: UseDebouncedAutoSaveArgs<
  TValue,
  TError
>): UseDebouncedAutoSaveReturn<TValue> {
  const [value, setLocalValue] = useState(serverValue)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const focusedRef = useRef(false)
  const lastSavedRef = useRef(serverValue)
  const inFlightRef = useRef<TValue | null>(null)
  const updatedAtRef = useRef(serverUpdatedAt)

  useEffect(() => {
    updatedAtRef.current = serverUpdatedAt
  }, [serverUpdatedAt])

  useEffect(() => {
    if (focusedRef.current) return
    setLocalValue(serverValue)
    lastSavedRef.current = serverValue
  }, [serverValue])

  useEffect(
    () => () => {
      if (debounceRef.current) clearTimeout(debounceRef.current)
    },
    []
  )

  async function performSave(next: TValue): Promise<void> {
    if (isEmpty(next)) return
    if (isEqual(next, lastSavedRef.current)) return
    if (inFlightRef.current !== null && isEqual(next, inFlightRef.current)) {
      return
    }

    inFlightRef.current = next
    try {
      const result = await save(next, updatedAtRef.current)

      if (result.ok) {
        lastSavedRef.current = result.value.value
        updatedAtRef.current = result.value.updatedAt
        return
      }

      setLocalValue(lastSavedRef.current)

      if (onError) {
        onError(result.error)
      } else if (result.error === "stale") {
        toast.error(
          "Someone else updated this character — refresh to see the latest."
        )
      } else {
        toast.error("Couldn't save. Try again.")
      }
    } finally {
      if (inFlightRef.current !== null && isEqual(inFlightRef.current, next)) {
        inFlightRef.current = null
      }
    }
  }

  function setValue(next: TValue): void {
    setLocalValue(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      void performSave(next)
    }, debounceMs)
  }

  function flush(): void {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    void performSave(value)
  }

  function revert(): void {
    setLocalValue(lastSavedRef.current)
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
  }

  function onFocusChange(focused: boolean): void {
    focusedRef.current = focused
    if (!focused) flush()
  }

  return { value, setValue, flush, revert, onFocusChange }
}
