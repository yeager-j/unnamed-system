"use client"

import {
  useEffect,
  useEffectEvent,
  useRef,
  useState,
  type RefObject,
} from "react"
import { toast } from "sonner"

import { type Result } from "@workspace/game-v2/kernel/result"

import { guardWrite } from "@/lib/sync/guard-write-transition"

/**
 * Debounced auto-save lifecycle for a free-text owner-mode field. Every
 * UNN-180 pattern free-text consumer (name, notes, ancestry, background,
 * per-knife/chain titles, …) needs the same plumbing: a local draft state,
 * a debounce timeout, a serialized save queue so the debounce-then-blur
 * pattern doesn't double-fire with the same `expectedVersion`, a
 * `lastSavedRef` to skip no-op edits, and a shared per-write-class
 * `versionRef` so sibling components coordinate on a single version token.
 * This hook is the one place those rules live.
 *
 * **Concurrency contract.** The `save` callback receives the current value
 * *and* the latest known per-write-class `version` (UNN-140) — the hook
 * does not let the consumer thread the token itself, because every place
 * I've seen consumers do that has eventually drifted from the prop. This is
 * the shared core; consumers go through the provider-bound wrappers
 * `useCharacterAutoSave` (sheet) / `useEntityAutoSave` (builder), which
 * resolve the *shared* per-write-class token + queue and supply the
 * {@link UseDebouncedAutoSaveArgs.dispatchWrite} pipeline that reads and bumps
 * it — the same way the click-write wrappers own their dispatch. Because every
 * same-class field flows through that one token, a sibling field's successful
 * bump is visible in the same frame — no waiting on the `revalidate →
 * prop-sync` round-trip. The provider keeps the token synced from the server
 * prop as the fallback for cross-tab / external bumps.
 *
 * Saves are serialized via a promise chain (`saveQueueRef`): when a save is
 * dispatched while another is in flight, it chains behind the in-flight one
 * and reads the *fresh* class token (just written by the prior save's success
 * branch) before its own request goes out. That closes the same-value
 * and different-value debounce+blur races for this field. When the wrappers
 * pass the provider's *shared* per-class queue (UNN-274), the chain spans
 * every same-class field too: blurring N sibling fields back-to-back (faster
 * than a round-trip) serializes them, so each reads the freshly-bumped token
 * instead of all dispatching at the stale pre-bump version and colliding.
 * Without a shared queue the hook still serializes its own writes via an
 * internal fallback queue.
 *
 * Stale handling is the wrapper's dispatch pipeline's business: both the v1
 * `dispatchCharacterWriteWithRetry` and the entity door's retrying dispatch
 * silently retry once on `"stale"` (UNN-203/UNN-568), so this hook's failure
 * branch means a real conflict, not a sibling-component race.
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
  /** The *shared* per-write-class save queue from the provider (UNN-274).
   *  Supplied by the wrappers so same-class debounced fields serialize their
   *  saves through one chain — back-to-back sibling edits each read the
   *  freshly-bumped `versionRef` instead of colliding at the stale token.
   *  Omitted, the hook falls back to an internal queue that serializes only
   *  this field's own debounce+blur. */
  saveQueueRef?: RefObject<Promise<void>>
  /**
   * The write pipeline `save` dispatches through — owned by the provider-bound
   * wrapper, so the hook itself is storage-blind (UNN-556). The v1 sheet's
   * `useCharacterAutoSave` supplies the silent-retry pipeline
   * (`dispatchCharacterWriteWithRetry`); the builder's `useEntityAutoSave`
   * supplies the entity door's plain guarded dispatch.
   * Contract: call `action` with the latest class token and update the shared
   * `versionRef` from a success before resolving.
   */
  dispatchWrite: (
    action: (
      expectedVersion: number
    ) => Promise<Result<{ value: TValue; version: number }, TError>>
  ) => Promise<Result<{ value: TValue; version: number }, TError | "stale">>
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
  onError?: (error: TError | "stale") => void
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
  saveQueueRef,
  dispatchWrite,
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
  const ownSaveQueueRef = useRef<Promise<void>>(Promise.resolve())
  const queueRef = saveQueueRef ?? ownSaveQueueRef

  function performSave(next: TValue): Promise<void> {
    const queued = queueRef.current.then(async () => {
      if (isEqual(next, lastSavedRef.current)) return

      // A *thrown* rejection (network drop, server crash, deploy-version skew,
      // auth interrupt) rolls the draft back and toasts through `guardWrite`;
      // a Next navigation signal (redirect/forbidden/…) rethrows instead of
      // being swallowed (UNN-379). Throws aren't routed through `onError`
      // because that's typed `TError` — expected failures return `Result.err`,
      // not throw.
      const result = await guardWrite(
        () => dispatchWrite((expectedVersion) => save(next, expectedVersion)),
        () => {
          setLocalValue(lastSavedRef.current)
          toast.error("Couldn't save. Try again.")
        }
      )
      if (result === null) return

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
    })
    // Safety net: even if the error-handling above throws (from `setLocalValue`,
    // `toast`, or an `onError` callback), keep the queue resolved so the next
    // save — including the unmount flush — still dispatches.
    queueRef.current = queued.catch(() => {})
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
  // listed in deps — lets the prop-sync effect fire on serverValue change
  // only, and lets the unmount cleanup read fresh `value`, `isEmpty`,
  // `isEqual`, and `performSave` without re-running every render. The version
  // token is *not* synced here: the shared `versionRef` is owned by the
  // provider's version-token store, so this hook only reads it (UNN-274).
  const syncFromServer = useEffectEvent(() => {
    if (!focusedRef.current) {
      setLocalValue(serverValue)
      lastSavedRef.current = serverValue
    }
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
  }, [serverValue])

  useEffect(() => () => flushOnUnmount(), [])

  return { value, setValue, flush, revert, onFocusChange }
}
