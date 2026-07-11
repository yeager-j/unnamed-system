"use client"

import { useEffect, useRef } from "react"

import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { type Result } from "@workspace/game-v2/kernel/result"

import type { ParticipantMeta } from "@/app/combat/[shortId]/encounter-access"
import type { CombatEntityWrite } from "@/domain/entity/commit/write.schema"
import { parseCharacterPing } from "@/hooks/character-version-sync"
import type { UseQueuedWriteReturn } from "@/hooks/use-queued-write"
import { useMonotonicVersionMap } from "@/hooks/version-token-store"
import { createWriteQueue, type WriteQueue } from "@/hooks/write-queue"
import { applyCombatantWriteAction } from "@/lib/actions/combat/commit/apply-combatant-write"
import type { ApplyCombatantWriteError } from "@/lib/actions/combat/commit/apply-combatant-write.schema"
import type { CommittedWrite } from "@/lib/actions/combat/commit/stores"
import { getEntityClassVersionAction } from "@/lib/actions/entity/versions"

import { decidePcPing } from "./pc-ping"

/**
 * One participant's resolved write route: dispatch a component write with
 * exactly this storage home's token(s), plus the realtime channel key for a
 * durable participant. Downstream code receives the distinction resolved — it
 * never re-reads `ParticipantMeta.storage`.
 */
export interface WriteLane {
  commit(
    write: CombatEntityWrite
  ): Promise<Result<CommittedWrite, ApplyCombatantWriteError>>
  /** The per-PC realtime channel key — `null` for inline lanes (and for a
   *  durable row whose public shortId hasn't resolved). */
  channel: { characterId: string; shortId: string } | null
}

/** One durable PC's realtime channel key. */
export interface PcChannel {
  characterId: string
  shortId: string
}

/**
 * The **client half of the CD19 write-router** (UNN-567) — the `storeFor` the
 * server has had since UNN-520, finally mirrored client-side (the
 * `clientStoreFor` of `docs/engine-v2/combat/write-router.example.ts`). This
 * module is the console's **sole consumer of `ParticipantMeta.storage`**: it
 * resolves the loader-projected meta once into per-participant {@link WriteLane}s,
 * and everything downstream (the dispatcher, the channel list, the ping
 * handler) reads lanes, not tags.
 *
 * What it owns, exclusively:
 *
 * - **The per-PC `vitals` token map** — seeded/forward-synced from
 *   `participantMeta` (the keyspace — which durable participants exist — lives
 *   in that prop), read by the durable lanes' token ports and the ping compare.
 * - **The per-character write queues** — one {@link createWriteQueue} core per
 *   durable character (the open-cardinality twin of `useQueuedWrite`'s
 *   single-row façade), created lazily at first commit (never during render),
 *   with one-shot stale-retry through {@link getEntityClassVersionAction}. The
 *   token port falls back to the meta-captured seed for the
 *   paint-before-effect window.
 * - **`onPcPing`** — one PC's character-channel ping (UNN-373): forward the
 *   vitals token if fresher, refresh (via the injected `onFresher`) per
 *   {@link decidePcPing}.
 * - **`pcChannels`** — one realtime listener per durable participant in the
 *   caller's (optimistic) roster, keyed by character shortId and deduped (a
 *   character could in principle occupy two slots).
 *
 * Inline lanes enqueue on the **encounter queue** and send only
 * `expectedVersion`; durable lanes enqueue on their **character queue** and
 * send only `expectedCharacterVersion` — each arm's honest envelope (UNN-567),
 * never a passenger token.
 */
export function useCombatantLanes({
  encounterId,
  encounterWrite,
  participantMeta,
  rosterIds,
  onFresher,
}: {
  encounterId: string
  encounterWrite: UseQueuedWriteReturn
  participantMeta: Record<ParticipantId, ParticipantMeta>
  /** The (optimistic) roster — which participants get channels right now. */
  rosterIds: ParticipantId[]
  /** Scheduled when a ping says the server is fresher (the console's
   *  microtask-deduped refresh). */
  onFresher: () => void
}): {
  laneOf: (participantId: ParticipantId) => WriteLane | undefined
  pcChannels: PcChannel[]
  onPcPing: (characterId: string, data: unknown) => void
} {
  const pcVitals = useMonotonicVersionMap<string>()
  useEffect(() => {
    for (const meta of Object.values(participantMeta)) {
      if (meta.storage === "durable") {
        pcVitals.bump(meta.characterId, meta.vitalsVersion)
      }
    }
  }, [participantMeta, pcVitals])

  const durableQueues = useRef(new Map<string, WriteQueue>())

  function durableQueueFor(meta: {
    characterId: string
    vitalsVersion: number
  }): WriteQueue {
    const existing = durableQueues.current.get(meta.characterId)
    if (existing !== undefined) return existing

    const created = createWriteQueue({
      token: {
        read: () => pcVitals.read(meta.characterId) ?? meta.vitalsVersion,
        bump: (version) => pcVitals.bump(meta.characterId, version),
      },
      refetchVersion: async () => {
        const fresh = await getEntityClassVersionAction({
          entityId: meta.characterId,
          versionClass: "vitals",
        })
        return fresh.ok ? fresh.value.version : null
      },
    })
    durableQueues.current.set(meta.characterId, created)
    return created
  }

  function laneOf(participantId: ParticipantId): WriteLane | undefined {
    const meta = participantMeta[participantId]
    if (meta === undefined) return undefined

    if (meta.storage === "durable") {
      return {
        channel:
          meta.characterShortId !== ""
            ? {
                characterId: meta.characterId,
                shortId: meta.characterShortId,
              }
            : null,
        commit: (write) =>
          durableQueueFor(meta).enqueue((expectedCharacterVersion) =>
            applyCombatantWriteAction({
              encounterId,
              expectedCharacterVersion,
              participantId,
              write,
            })
          ),
      }
    }

    return {
      channel: null,
      commit: (write) =>
        encounterWrite.enqueue((expectedVersion) =>
          applyCombatantWriteAction({
            encounterId,
            expectedVersion,
            participantId,
            write,
          })
        ),
    }
  }

  function onPcPing(characterId: string, data: unknown) {
    const versions = parseCharacterPing(data, "entity")
    if (!versions) return
    const decision = decidePcPing(versions, pcVitals.read(characterId))
    if (decision.nextVitals !== undefined) {
      pcVitals.bump(characterId, decision.nextVitals)
    }
    if (decision.refresh) onFresher()
  }

  const pcChannels = dedupeByCharacter(
    rosterIds.flatMap((participantId) => {
      const channel = laneOf(participantId)?.channel
      return channel ? [channel] : []
    })
  )

  return { laneOf, pcChannels, onPcPing }
}

function dedupeByCharacter(channels: PcChannel[]): PcChannel[] {
  const seen = new Set<string>()
  return channels.filter((channel) => {
    if (seen.has(channel.characterId)) return false
    seen.add(channel.characterId)
    return true
  })
}
