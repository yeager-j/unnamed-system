"use client"

import { useEffect, useRef, type RefObject } from "react"

/**
 * Holds an optimistic-concurrency version token in a mutable ref synced
 * **forward-only** from the server-supplied prop. Versions only ever increment
 * (each guarded write bumps `<class>Version + 1`), so a prop that arrives lower
 * than the ref is always a stale render frame — a `router.refresh()` still in
 * flight, a poll that raced a just-landed write — and must never roll the ref
 * back below a token a write or a ping already advanced it to. That regress is
 * the bug {@link import("./character-version-sync").mergePingedVersions}
 * documents its invariant against; this hook is the one place the forward-only
 * sync rule lives.
 *
 * Read the current token synchronously before dispatching a write
 * (`ref.current`); the write pipeline overwrites the ref from the server's
 * response so a rapid follow-up sees the fresh value without waiting for React
 * commit + effects to propagate the new prop.
 */
export function useMonotonicVersionRef(
  serverVersion: number
): RefObject<number> {
  const ref = useRef(serverVersion)
  useEffect(() => {
    if (serverVersion > ref.current) {
      ref.current = serverVersion
    }
  }, [serverVersion])
  return ref
}
