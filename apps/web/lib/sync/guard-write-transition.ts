import { unstable_rethrow } from "next/navigation"

/**
 * Runs a write and converts a *thrown* Server Action rejection into `onReject`
 * (UNN-379). A Server Action **rejects** (rather than returning `Result.err`) on
 * a transport failure — network drop, server crash, deploy-version skew
 * ("Failed to find Server Action"), an auth interrupt — and in React 19 a throw
 * from an async transition propagates to the nearest route error boundary. This
 * catches it so the surface can surface its own retry toast instead; the
 * optimistic frame reverts on its own when the transition settles, so `onReject`
 * only needs to toast. Expected, domain-meaningful failures still resolve as
 * `Result.err` and never reach here (see `kernel/result`'s docstring: expected
 * failures return, programmer errors throw).
 *
 * Next's navigation control-flow — `redirect` / `notFound` / `forbidden` /
 * `unauthorized`, which all navigate by **throwing** a framework signal — is
 * re-thrown via {@link unstable_rethrow} so a genuine 403 or redirect still
 * happens instead of being swallowed into a misleading "couldn't save" toast.
 *
 * @returns the resolved value, or `null` when the write threw (the caller has
 *   already recovered via `onReject` and should bail).
 */
export async function guardWrite<T>(
  run: () => Promise<T>,
  onReject: (error: unknown) => void
): Promise<T | null> {
  try {
    return await run()
  } catch (error) {
    unstable_rethrow(error)
    console.error("[guardWrite] Server Action rejected", error)
    onReject(error)
    return null
  }
}

/**
 * The void-transition wrapper over {@link guardWrite}: wrap an entire
 * `startTransition` body so a thrown rejection can't escape to the route error
 * boundary, leaving the body's own `Result` handling verbatim. Use it as
 * `startTransition(() => guardWriteTransition(async () => { …body… }, onReject))`.
 */
export async function guardWriteTransition(
  body: () => Promise<void>,
  onReject: (error: unknown) => void
): Promise<void> {
  await guardWrite(body, onReject)
}
