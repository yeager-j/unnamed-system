import "server-only"

import { after } from "next/server"

import type { EncounterStatus } from "@/lib/db/schema/encounter"
import type { VersionClass } from "@/lib/db/version-classes"

import { realtimeChannelName, type RealtimeDomain } from "./channels"
import { getAblyRest } from "./client"

/**
 * Fire-and-forget invalidation pings over Ably (realtime ADR, Decisions 1, 4,
 * 5). The payload is advisory metadata only — touched version tokens, never
 * domain data — so subscribers refetch through the existing authed/redacting
 * read paths and the server-side redaction model is untouched.
 *
 * With `ABLY_API_KEY` unset every publish is a silent no-op. A publish failure
 * is logged and swallowed; it never fails or delays the write, which is also
 * why the POST is scheduled via Next's `after()`: it runs once the response is
 * done, i.e. after any wrapping `db.transaction` has committed, so a ping
 * can't race its own refetch.
 */

/**
 * The character ping body: touched version classes mapped to their new values,
 * mirroring the UNN-203 `BroadcastChannel` message so the sheet's per-class
 * version-compare can be reused as-is by the subscription ticket (UNN-372).
 */
export interface CharacterPing {
  versions: Partial<Record<VersionClass, number>>
}

/** The encounter ping body: the new session version and lifecycle status. */
export interface EncounterPing {
  version: number
  status: EncounterStatus
}

const PING_EVENT_NAME = "ping"

function schedulePublish(
  domain: RealtimeDomain,
  shortId: string,
  payload: CharacterPing | EncounterPing
): void {
  const client = getAblyRest()
  if (!client) return

  const task = async () => {
    try {
      const channel = client.channels.get(realtimeChannelName(domain, shortId))
      await channel.publish(PING_EVENT_NAME, payload)
    } catch (error) {
      console.error(`Realtime ping failed for ${domain}:${shortId}`, error)
    }
  }

  try {
    after(task)
  } catch {
    // Outside a request scope (e.g. a test calling a write wrapper directly)
    // `after` throws; run the ping inline-but-unawaited instead.
    void task()
  }
}

/**
 * Pings a character's channel after a successful guarded write. `versions`
 * carries only the classes that write bumped (one, or both for level-up).
 */
export function publishCharacterPing(
  shortId: string,
  versions: CharacterPing["versions"]
): void {
  schedulePublish("character", shortId, { versions })
}

/** Pings an encounter's channel after a successful guarded write. */
export function publishEncounterPing(
  shortId: string,
  ping: EncounterPing
): void {
  schedulePublish("encounter", shortId, ping)
}
