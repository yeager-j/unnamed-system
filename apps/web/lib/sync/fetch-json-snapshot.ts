"use client"

/**
 * The shared fetch-and-throw body every {@link import("./use-snapshot-subscription").useSnapshotSubscription}
 * fetcher is built on: a no-store GET that forwards the subscription's
 * `AbortSignal` (so a superseded refetch is cancelled, not left to land out of
 * order) and **rejects** on a non-ok response — the subscription's `.catch`
 * relies on that rejection to mark the snapshot stale. Each watch view wraps this
 * with its own URL template and any response-shape massage.
 */
export async function fetchJsonSnapshot<T>(
  path: string,
  signal?: AbortSignal
): Promise<T> {
  const response = await fetch(path, { cache: "no-store", signal })
  if (!response.ok)
    throw new Error(`snapshot request failed: ${response.status}`)
  return (await response.json()) as T
}
