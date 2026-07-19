import {
  classifyPushDoorRefusal,
  type MutationEnvelope,
  type PushDoorRefusal,
  type PushError,
} from "@workspace/replica/transport"
import { err, ok, type Result } from "@workspace/result"

/** Base delay after a retryable push failure; doubles per consecutive
 *  failure of the same mutation, capped below the Ably ping cadence. */
const PUSH_BACKOFF_BASE_MS = 250
const PUSH_BACKOFF_MAX_MS = 4_000

/** What every replica push door returns — the package's door-refusal
 *  vocabulary, re-exported so the actions' return types name it locally. */
export type PushDoorError<Rejection> = PushDoorRefusal<Rejection>

export interface PacedPushOptions<Invocation, Rejection, Remote> {
  /** The push-door Server Action, bound to its root's address. */
  readonly send: (
    envelope: MutationEnvelope<Invocation>
  ) => Promise<Result<Remote, PushDoorError<Rejection>>>
  /** The rejection this door's clients use for "the authority cannot
   *  understand this build's bytes" (decode refusals, malformed envelope). */
  readonly invalidWrite: Rejection
}

/**
 * The shared push half of every replica source (UNN-645, extracted in
 * UNN-646 when the combat sources became its second and third consumers).
 * Owns the three obligations every door-wrapping source shares:
 *
 * - **Every throw is `retryable` — including Next navigation sentinels**
 *   (Codex P2, PR #385): a throw from the session/middleware layer means the
 *   processor recorded NOTHING and the watermark did not advance, so
 *   reporting `rejected` would advance the replica past an unrecorded ID and
 *   wedge the stream into `unknown-client`. `retryable` is honest — the
 *   retry budget bounds it, the replica parks, and after recovery the same
 *   ID redelivers. Doors never throw refusals by design (auth refusals are
 *   typed, recorded rejections).
 * - **Push pacing** (design open decision 3): the replica retries within an
 *   epoch with no delay of its own, so the backoff lives here — exponential
 *   per consecutive retryable failure of the same mutation, abandoned
 *   immediately when the attempt is aborted.
 * - **Refusal mapping** is `classifyPushDoorRefusal`, which lives in
 *   `@workspace/replica` because it is Replica protocol knowledge, not
 *   Showtime's. This module supplies only the app-specific `invalidWrite`
 *   rejection. (UNN-646 review: the classifier used to live here and mapped
 *   the door's UNRECORDED `invalid-input` to `rejected`, violating the very
 *   rule stated above — see the package doc for the corrected arms.)
 */
export function createPacedPushEnvelope<Invocation, Rejection, Remote>(
  options: PacedPushOptions<Invocation, Rejection, Remote>
): (
  envelope: MutationEnvelope<Invocation>,
  signal: AbortSignal
) => Promise<Result<Remote, PushError<Rejection>>> {
  const failures = new Map<number, number>()

  return async (envelope, signal) => {
    const priorFailures = failures.get(envelope.mutationId) ?? 0
    if (priorFailures > 0) {
      const paced = await backoff(priorFailures, signal)
      if (!paced) return err({ kind: "retryable", cause: "aborted" })
    }

    let result: Result<Remote, PushDoorError<Rejection>>
    try {
      result = await options.send(envelope)
    } catch (error) {
      // Includes Next navigation sentinels: nothing was recorded, so the
      // only honest classification is ambiguous-retryable (see the module
      // doc). Never map an unrecorded failure to `rejected`.
      failures.set(envelope.mutationId, priorFailures + 1)
      return err({ kind: "retryable", cause: error })
    }

    failures.delete(envelope.mutationId)
    if (result.ok) return ok(result.value)
    return err(classifyPushDoorRefusal(result.error, options.invalidWrite))
  }
}

/** Abortable exponential delay; resolves false when aborted mid-wait. */
function backoff(consecutive: number, signal: AbortSignal): Promise<boolean> {
  const delay = Math.min(
    PUSH_BACKOFF_BASE_MS * 2 ** (consecutive - 1),
    PUSH_BACKOFF_MAX_MS
  )
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve(false)
      return
    }
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort)
      resolve(true)
    }, delay)
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve(false)
    }
    signal.addEventListener("abort", onAbort, { once: true })
  })
}
