import "server-only"

import { after } from "next/server"

import type { DungeonStatus } from "@/lib/db/schema/dungeon"
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
 * Which row family's version counters a {@link CharacterPing} carries. The
 * shared-id dual mint (UNN-551) means the v1 `characters` row and the v2
 * `entity` row ping the **same** `character:{shortId}` channel, but their
 * per-class counters advance independently — so a ping must say which family
 * it bumped, or a subscriber's forward-only version compare cross-wires the
 * two and strands its tokens above the true value (the same disease
 * {@link VersionKind} cures on the encounter/dungeon channels). Dissolves with
 * the v1 row (S4).
 */
export type CharacterPingKind = "character" | "entity"

/**
 * The character ping body: which row family moved, and the touched version
 * classes mapped to their new values, feeding the subscribers' per-class
 * version-compare (UNN-372/UNN-569).
 */
export interface CharacterPing {
  kind: CharacterPingKind
  versions: Partial<Record<VersionClass, number>>
}

/**
 * Which row's optimistic `version` a {@link VersionPing} carries (UNN-468). The
 * `encounter:{shortId}` and `dungeon:{shortId}` channels each carry **two**
 * independent version streams — the temporal-layer row (encounter/dungeon) and
 * its Map Instance — so a ping must say which counter it advanced, or a `version`
 * compare cross-wires the two (ADR — *Transport*, "Snapshot versions are
 * composite"). The subscriber compares each ping against the matching ref.
 */
export type VersionKind = "encounter" | "mapInstance" | "dungeon"

/**
 * A version-invalidation ping on an encounter or dungeon channel: which counter
 * moved (`kind`) and its new value. `status` rides only the **temporal-layer**
 * kinds (`encounter`/`dungeon`) — it is the lifecycle the campaign banner and the
 * snapshot hooks read; a `mapInstance` ping carries none.
 */
export interface VersionPing {
  kind: VersionKind
  version: number
  status?: EncounterStatus | DungeonStatus
}

/** The encounter ping body callers pass — the new session version and lifecycle
 *  status; {@link publishEncounterPing} stamps `kind: "encounter"`. */
export interface EncounterPing {
  version: number
  status: EncounterStatus
}

const PING_EVENT_NAME = "ping"

function schedulePublish(
  domain: RealtimeDomain,
  shortId: string,
  payload: CharacterPing | VersionPing
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
 * Pings a character's channel after a successful guarded write. `kind` names
 * the row family whose counters moved (`"entity"` from the entity door,
 * `"character"` from the v1 write core); `versions` carries only the classes
 * that write bumped (one, or both for level-up).
 */
export function publishCharacterPing(
  shortId: string,
  kind: CharacterPingKind,
  versions: CharacterPing["versions"]
): void {
  schedulePublish("character", shortId, { kind, versions })
}

/** Pings an encounter's channel after a successful **session** write (the
 *  encounter row's version moved). */
export function publishEncounterPing(
  shortId: string,
  ping: EncounterPing
): void {
  schedulePublish("encounter", shortId, { kind: "encounter", ...ping })
}

/** Pings an encounter's channel after a successful **Instance** write — a combat
 *  move/spatial event that bumped only `map_instances.version` (UNN-468). Tagged
 *  `mapInstance` so the watch compares it against the Instance ref, not the
 *  encounter ref (the two counters share this channel). */
export function publishEncounterInstancePing(
  shortId: string,
  version: number
): void {
  schedulePublish("encounter", shortId, { kind: "mapInstance", version })
}

/** Pings a dungeon's channel after a successful **dungeon-row** write (turn loop,
 *  reminders, status flip). */
export function publishDungeonPing(
  shortId: string,
  ping: { version: number; status?: DungeonStatus }
): void {
  schedulePublish("dungeon", shortId, { kind: "dungeon", ...ping })
}

/** Pings a dungeon's channel after a successful **Instance** write — a token
 *  move or Zone reveal that bumped only `map_instances.version` (the fog view's
 *  main live path). Tagged `mapInstance` for the same reason as the encounter
 *  Instance ping. */
export function publishDungeonInstancePing(
  shortId: string,
  version: number
): void {
  schedulePublish("dungeon", shortId, { kind: "mapInstance", version })
}
