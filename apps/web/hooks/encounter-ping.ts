"use client"

import type { EncounterPing } from "@/lib/realtime/publish"

/**
 * Narrows an untrusted encounter-channel ping payload (UNN-370's
 * `{version, status}`) for the subscribe surfaces — the DM console compares
 * `version`, the campaign page's banner listener compares `status`. Pings are
 * advisory: a malformed payload is dropped (`null`), never an error, and each
 * field is only present when it survived its own type check.
 */
export function parseEncounterPing(
  data: unknown
): Partial<EncounterPing> | null {
  if (typeof data !== "object" || data === null) return null
  const { version, status } = data as { version?: unknown; status?: unknown }

  const parsed: Partial<EncounterPing> = {}
  if (typeof version === "number" && Number.isFinite(version)) {
    parsed.version = version
  }
  if (status === "draft" || status === "live" || status === "ended") {
    parsed.status = status
  }
  if (parsed.version === undefined && parsed.status === undefined) return null
  return parsed
}
