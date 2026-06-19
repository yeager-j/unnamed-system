"use client"

import type { VersionKind, VersionPing } from "@/lib/realtime/publish"

/**
 * Narrows an untrusted encounter/dungeon-channel ping (UNN-468's
 * `{kind, version, status?}`) for the subscribe surfaces. Pings are advisory: a
 * malformed payload is dropped (`null`), never an error, and each field is only
 * present when it survived its own type check. Replaces the UNN-370
 * `parseEncounterPing` now that both temporal layers carry the same tagged shape.
 *
 * **Deploy-window safety:** the already-deployed `encounter` channel may briefly
 * carry a legacy untagged `{version, status}` ping. Every legacy ping was a
 * temporal-version ping, so an absent/invalid `kind` falls back to `fallbackKind`
 * — the caller's channel temporal layer (`"encounter"` / `"dungeon"`). The
 * brand-new `dungeon` channel only ever carries tagged pings.
 */
export function parseVersionPing(
  data: unknown,
  fallbackKind: VersionKind
): VersionPing | null {
  if (typeof data !== "object" || data === null) return null
  const { kind, version, status } = data as {
    kind?: unknown
    version?: unknown
    status?: unknown
  }

  if (typeof version !== "number" || !Number.isFinite(version)) return null

  const parsed: VersionPing = {
    kind: isVersionKind(kind) ? kind : fallbackKind,
    version,
  }
  if (isStatus(status)) parsed.status = status
  return parsed
}

function isVersionKind(value: unknown): value is VersionKind {
  return value === "encounter" || value === "mapInstance" || value === "dungeon"
}

/** The union of both temporal layers' lifecycle strings (encounter
 *  draft/live/ended + dungeon draft/active/done). */
function isStatus(value: unknown): value is VersionPing["status"] {
  return (
    value === "draft" ||
    value === "live" ||
    value === "ended" ||
    value === "active" ||
    value === "done"
  )
}
