"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"
import { toast } from "sonner"

import type { EditSurface } from "@/lib/db/version-classes"
import type { Result } from "@/lib/result"

import { dispatchCharacterWriteWithRetry } from "./dispatch-character-write"

/**
 * Debounced auto-save lifecycle for a free-text owner-mode field. Every
 * UNN-180 pattern free-text consumer (name, notes, ancestry, background,
 * per-knife/chain titles, …) needs the same plumbing: a local draft state,
 * a debounce timeout, a serialized save queue so the debounce-then-blur
 * pattern doesn't double-fire with the same `expectedVersion`, a
 * `lastSavedRef` to skip no-op edits, and a `versionRef` with two
 * convergent writers (own-action success + prop sync) so sibling components
 * don't leave us with a stale version token. This hook is the one place
 * those rules live.
 *
 * **Concurrency contract.** The `save` callback receives the current value
 * *and* the latest known per-write-class `version` (UNN-140) — the hook
 * does not let the consumer thread the token itself, because every place
 * I've seen consumers do that has eventually drifted from the prop. Saves
 * are serialized via a single promise chain (`saveQueueRef`): when a save
 * is dispatched while another is in flight, it chains behind the in-flight
 * one and reads the *fresh* `versionRef.current` (just written by the prior
 * save's success branch) before its own request goes out. That closes both
 * the same-value and different-value debounce+blur races.
 *
 * On success, the ref is updated from `result.value.version` immediately,
 * so a rapid follow-up save doesn't have to wait for React commit + effect
 * to propagate the prop.
 *
 * **Silent stale retry + cross-tab broadcast** (UNN-203). Every save flows
 * through {@link dispatchCharacterWriteWithRetry}, which on `"stale"`
 * refetches the current per-class version and re-dispatches once before
 * the consumer's error path runs, and on success broadcasts the
 * invalidation to sibling tabs. The hook's failure branch therefore only
 * fires when a write stales *twice in a row* — a real conflict, not a
 * sibling-component race.
 *
 * **Trimming + idempotence are the consumer's job inside `save`.** The
 * hook only checks reference equality for last-saved skips, so a consumer
 * that trims (`name`) should trim before comparing against the server's
 * stored value too. Use `isEqual` to override.
 *
 * **Empty values.** When `isEmpty(value)` is true the hook will not
 * dispatch a save. On `flush` (blur) or unmount, if the draft is empty
 * *and* differs from the last saved value, the draft is reverted to the
 * last saved value — the input visibly snaps back, no toast, no validation
 * UI. Mid-keystroke (the debounce path) the empty value is preserved so
 * the user can keep typing. Override `isEmpty` to opt out.
 *
 * **Unmount.** On unmount, if there's a dirty non-empty draft, the hook
 * fires a final fire-and-forget save (chained through the same queue) so
 * a client-side nav during the debounce window doesn't silently lose what
 * was typed.
 *
 * On failure: rolls the draft back to the last-saved value and surfaces a
 * Sonner toast — `"stale"` gets a refresh-prompt, anything else gets a
 * generic "couldn't save." Override copy via `onError`.
 */

export interface UseDebouncedAutoSaveArgs<TValue, TError extends string> {
  /** The current value from the server. Drives the initial draft and the
   *  rollback target on failure. */
  serverValue: TValue
  /** The per-write-class version token from the server (UNN-140). Pass the
   *  column that matches this field's write class — e.g. `identityVersion`
   *  for name/notes/identity-list editors. */
  serverVersion: number
  /** Owning character — used by the silent-retry path to refetch the
   *  fresh per-class version after a `"stale"` and by the broadcast
   *  pipeline to notify sibling tabs. */
  characterId: string
  /** The edit surface this editor mutates. Passed through to
   *  {@link dispatchCharacterWriteWithRetry}, which resolves its per-write-class
   *  bucket — the one driving the refetch field and the broadcast tag — from the
   *  surface→class map (UNN-233). */
  surface: EditSurface
  /** Persists `value`, conditioned on `expectedVersion`. */
  save: (
    value: TValue,
    expectedVersion: number
  ) => Promise<Result<{ value: TValue; version: number }, TError>>
  /** Defaults to 500ms — the Notion-feel sweet spot. */
  debounceMs?: number
  /** Skip the save when this returns true (and on flush, revert the draft
   *  to the last-saved value). Default: never skip. */
  isEmpty?: (value: TValue) => boolean
  /** Used for `value === lastSaved` short-circuits. Default: `Object.is`. */
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
  serverVersion,
  characterId,
  surface,
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
  const versionRef = useRef(serverVersion)
  const saveQueueRef = useRef<Promise<void>>(Promise.resolve())

  function performSave(next: TValue): Promise<void> {
    const queued = saveQueueRef.current.then(async () => {
      if (isEqual(next, lastSavedRef.current)) return

      try {
        const result = await dispatchCharacterWriteWithRetry({
          characterId,
          surface,
          versionRef,
          action: (expectedVersion) => save(next, expectedVersion),
        })

        if (result.ok) {
          lastSavedRef.current = result.value.value
          return
        }

        setLocalValue(lastSavedRef.current)

        if (onError) {
          onError(result.error)
        } else if (result.error === "stale") {
          toast.error("Couldn't sync — refresh to see the latest changes.")
        } else {
          toast.error("Couldn't save. Try again.")
        }
      } catch (error) {
        // `save` threw (network drop, server crash, auth interrupt) or our
        // own error branch threw. Roll back, surface a generic toast, and
        // let the queue keep flowing. Throws aren't routed through `onError`
        // because that's typed `TError` — expected failures should return
        // `Result.err`, not throw.
        console.error("[useDebouncedAutoSave] save threw", error)
        setLocalValue(lastSavedRef.current)
        toast.error("Couldn't save. Try again.")
      }
    })
    // Safety net: even if the inner try/catch itself somehow rejects (a
    // throw from `setLocalValue` or `toast`, an unhandled error in
    // microtask scheduling), keep the queue resolved so the next save —
    // including the unmount flush — still dispatches.
    saveQueueRef.current = queued.catch(() => {})
    return queued
  }

  function setValue(next: TValue): void {
    setLocalValue(next)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      debounceRef.current = null
      if (isEmpty(next)) return
      void performSave(next)
    }, debounceMs)
  }

  function flush(): void {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (isEmpty(value)) {
      if (!isEqual(value, lastSavedRef.current)) {
        setLocalValue(lastSavedRef.current)
      }
      return
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

  // useEffectEvent (React 19.2) sees the latest props/state without being
  // listed in deps — lets the prop-sync effect fire on version-bump only,
  // and lets the unmount cleanup read fresh `value`, `isEmpty`, `isEqual`,
  // and `performSave` without re-running every render.
  const syncFromServer = useEffectEvent(() => {
    if (!focusedRef.current) {
      setLocalValue(serverValue)
      lastSavedRef.current = serverValue
    }
    versionRef.current = serverVersion
  })
  const flushOnUnmount = useEffectEvent(() => {
    if (debounceRef.current) {
      clearTimeout(debounceRef.current)
      debounceRef.current = null
    }
    if (!isEqual(value, lastSavedRef.current) && !isEmpty(value)) {
      void performSave(value)
    }
  })

  useEffect(() => {
    syncFromServer()
  }, [serverValue, serverVersion])

  useEffect(() => () => flushOnUnmount(), [])

  return { value, setValue, flush, revert, onFocusChange }
}
