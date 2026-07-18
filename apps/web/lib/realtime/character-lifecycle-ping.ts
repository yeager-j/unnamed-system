import type { PlayerCharacterStatus } from "@/lib/db/schema/player-character"

/** Narrows the optional PC lifecycle fact carried by entity-family pings.
 * The payload is untrusted and advisory; malformed or cross-family values
 * cannot trigger an owner RSC refresh. */
export function parsePlayerCharacterStatus(
  data: unknown
): PlayerCharacterStatus | null {
  if (typeof data !== "object" || data === null) return null
  const ping = data as { kind?: unknown; status?: unknown }
  if (ping.kind !== "entity") return null
  if (ping.status !== "draft" && ping.status !== "finalized") return null
  return ping.status
}
