"use client"

import type { PingedVersions } from "@/hooks/character-version-sync"
import { EDIT_SURFACE_CLASS, type VersionClass } from "@/lib/db/version-classes"

/**
 * The DM console's refresh decision for one PC combatant's character ping
 * (UNN-373). The console tracks only the PC's `vitalsVersion` (the one class
 * it writes, via the drawer's pools actions), so:
 *
 * - a **fresher vitals** version → forward the tracked value and refresh;
 * - a **stale/equal vitals-only** ping is an echo of the console's own write
 *   (or of a refresh that already landed) → skip;
 * - any **non-vitals class** in the ping → refresh unconditionally: the
 *   console renders identity/attribute/affinity-derived data but never writes
 *   those classes, so such a ping is always someone else's change.
 */

const VERSION_CLASSES = new Set<string>(Object.values(EDIT_SURFACE_CLASS))

export interface PcPingDecision {
  /** The forwarded vitals version, present only when the ping was fresher. */
  nextVitals?: number
  refresh: boolean
}

export function decidePcPing(
  versions: PingedVersions,
  knownVitals: number | undefined
): PcPingDecision {
  const vitals = versions.vitals
  const fresherVitals =
    typeof vitals === "number" &&
    Number.isFinite(vitals) &&
    (knownVitals === undefined || vitals > knownVitals)

  const hasNonVitalsClass = Object.entries(versions).some(
    ([versionClass, version]) =>
      versionClass !== ("vitals" satisfies VersionClass) &&
      VERSION_CLASSES.has(versionClass) &&
      typeof version === "number" &&
      Number.isFinite(version)
  )

  return {
    ...(fresherVitals ? { nextVitals: vitals } : {}),
    refresh: fresherVitals || hasNonVitalsClass,
  }
}
