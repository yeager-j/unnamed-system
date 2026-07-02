"use client"

import { useRouter } from "next/navigation"
import {
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react"
import { toast } from "sonner"

import {
  endOfTurnObligations,
  type EncounterState,
} from "@workspace/game-v2/encounter"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"

import type { EncounterForDM } from "@/app/combat/[shortId]/encounter-access"
import {
  dispatchCombatEvent,
  type ConsoleDispatchEvent,
} from "@/components/combat/console/dispatch-event"
import { decidePcPing } from "@/components/combat/console/pc-ping"
import { type ConsolePhase } from "@/components/combat/turn-order-strip"
import { parseCharacterPing } from "@/hooks/character-version-sync"
import { fetchEncounterVersion } from "@/hooks/fetch-encounter-version"
import { fetchInstanceVersion } from "@/hooks/fetch-instance-version"
import { useCombatantWrite } from "@/hooks/use-combatant-write"
import { useQueuedWrite } from "@/hooks/use-queued-write"
import { useRealtimeChannel } from "@/hooks/use-realtime-channel"
import { parseVersionPing } from "@/hooks/version-ping"
import { useMonotonicVersionMap } from "@/hooks/version-token-store"
import { endCombatAction } from "@/lib/actions/combat/end-combat"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"
import {
  reduceConsoleOptimistic,
  type ConsoleOptimisticAction,
} from "@/lib/combat/console-optimistic"
import { buildConsoleView } from "@/lib/combat/view/console-view"
import {
  combatantDetail,
  type DurableHydration,
} from "@/lib/combat/view/detail-view"
import { buildRosterView } from "@/lib/combat/view/roster-view"
import { buildZoneOverview } from "@/lib/combat/view/zone-overview"
import { resolveSession } from "@/lib/game-engine-v2"

/**
 * The live DM console's owner-mode write surface, rewritten onto engine v2
 * (UNN-535) — the encounter analog of `useInventoryEditor`. It mirrors the
 * server's reducers optimistically, so the frame the DM sees is structurally
 * identical to what `applyCombatEventAction` persists; failures toast while
 * React reverts the optimistic state automatically.
 *
 * **One optimistic container (UNN-535).** v1's two containers (session +
 * instance, each with its own reducer) collapse into a single
 * `useOptimistic<EncounterState, ConsoleOptimisticAction>` over
 * `{ session, mapInstance }` reduced by {@link reduceConsoleOptimistic} — the
 * same composition root the server runs, plus the paired roster arms and the
 * `write` arm (the Writers' predictor applied to the participant **in the
 * current frame**, the structural UNN-226 fix). The **two version queues**
 * survive: the encounter row and the Instance row still version independently,
 * so {@link dispatchCombatEvent} routes each event to the queue owning the row
 * it writes, both with one-shot stale-retry (`fetchEncounterVersion` /
 * `fetchInstanceVersion`).
 *
 * **Component writes** (HP/SP damage & heal — on inline enemies *and* durable
 * PCs, deliberately superseding UNN-482's read-only PC vitals per this
 * ticket's AC) go through {@link useCombatantWrite}: prediction into the same
 * container, dispatch routed by storage home — inline through the encounter
 * queue, durable through a per-character `vitalsVersion` chain that never
 * touches the encounter ref.
 *
 * **Realtime (UNN-373)** is unchanged in shape: the encounter channel's
 * kind-routed ping compare (encounter vs mapInstance version streams), the
 * microtask-deduped `scheduleRefresh`, and the per-PC character channels — now
 * keyed off `participantMeta[*].characterShortId`, with the monotonic per-PC
 * `vitals` map seeded from `participantMeta[*].vitalsVersion`.
 *
 * The dungeon fork is gone: dungeon combat is stubbed until PR11d, so
 * {@link endEncounter} is always the composed v2 {@link endCombatAction}
 * (sweep + prune + status flip, atomic over both tokens).
 */
export function useCombatConsole(
  data: EncounterForDM,
  durableHydrationById: Record<ParticipantId, DurableHydration> = {}
) {
  const { encounter, participantMeta } = data
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  const [state, applyOptimistic] = useOptimistic<
    EncounterState,
    ConsoleOptimisticAction
  >(
    { session: data.session, mapInstance: data.instance.state },
    reduceConsoleOptimistic
  )

  const encounterWrite = useQueuedWrite({
    serverVersion: encounter.version,
    refetchVersion: () => fetchEncounterVersion(encounter.shortId),
  })
  const instanceWrite = useQueuedWrite({
    serverVersion: data.instance.version,
    refetchVersion: () => fetchInstanceVersion(encounter.shortId),
  })
  const { versionRef } = encounterWrite

  /**
   * The per-PC `vitals` token map: the realtime ping compare ({@link onPcPing})
   * *and* the durable write arm's expected-version source share it, seeded /
   * forward-synced from the loader-projected `participantMeta` (the keyspace —
   * which durable participants exist — lives in that prop).
   */
  const pcVitals = useMonotonicVersionMap<string>()
  useEffect(() => {
    for (const meta of Object.values(participantMeta)) {
      if (meta.storage === "durable") {
        pcVitals.bump(meta.characterId, meta.vitalsVersion)
      }
    }
  }, [participantMeta, pcVitals])

  const refreshScheduled = useRef(false)
  function scheduleRefresh() {
    if (refreshScheduled.current) return
    refreshScheduled.current = true
    queueMicrotask(() => {
      refreshScheduled.current = false
      router.refresh()
    })
  }

  useRealtimeChannel({
    domain: "encounter",
    shortId: encounter.shortId,
    onPing: (data) => {
      const ping = parseVersionPing(data, "encounter")
      if (!ping) return
      // The encounter channel carries two version streams (UNN-468): an
      // `encounter` ping compares against the encounter ref, a `mapInstance`
      // ping (a concurrent spatial write) against the Instance ref.
      const ref =
        ping.kind === "mapInstance" ? instanceWrite.versionRef : versionRef
      if (ping.version <= ref.current) return
      scheduleRefresh()
    },
    onReconnect: () => router.refresh(),
  })

  /** Handler for one PC combatant's character-channel ping (UNN-373). */
  function onPcPing(characterId: string, data: unknown) {
    const versions = parseCharacterPing(data)
    if (!versions) return
    const decision = decidePcPing(versions, pcVitals.read(characterId))
    if (decision.nextVitals !== undefined) {
      pcVitals.bump(characterId, decision.nextVitals)
    }
    if (decision.refresh) scheduleRefresh()
  }

  function dispatch(event: ConsoleDispatchEvent) {
    startTransition(async () => {
      const result = await dispatchCombatEvent({
        event,
        encounterId: encounter.id,
        applyOptimistic,
        encounterWrite,
        instanceWrite,
      })
      if (!result.ok) {
        toast.error(combatErrorMessage(result.error))
        return
      }
      // No client `router.refresh()` per dispatch (UNN-482): the combat
      // actions call `revalidateEncounter`, whose RSC payload rides this
      // transition's action response and advances the `useOptimistic` base —
      // a rapid burst accumulates and reconciles with zero client refreshes.
      // PC HP (a cross-route read) stays live via the realtime PC-ping path.
    })
  }

  const { dispatchWrite } = useCombatantWrite({
    encounterId: encounter.id,
    encounterWrite,
    characterVersions: pcVitals,
    metaOf: (participantId) => participantMeta[participantId],
    componentsOf: (participantId) =>
      state.session.participants.find((p) => p.id === participantId)?.entity
        .components,
    applyOptimistic,
  })

  /**
   * Ends the encounter: the composed v2 combat-end (overlay sweep + occupancy
   * prune + `ended` status flip, one transaction over both version tokens).
   * Dispatched through the encounter queue so it serializes behind any
   * in-flight session write; the Instance token reads its own ref (no
   * in-flight move at end-time in practice). The server bumped the Instance
   * row too, so its ref hand-advances on success.
   */
  function endEncounter() {
    startTransition(async () => {
      const result = await encounterWrite.enqueue((expectedVersion) =>
        endCombatAction({
          encounterId: encounter.id,
          expectedVersion,
          expectedInstanceVersion: instanceWrite.versionRef.current,
        })
      )
      if (!result.ok) {
        toast.error(combatErrorMessage(result.error))
        return
      }
      instanceWrite.versionRef.current += 1
      router.refresh()
    })
  }

  // ── The derived combat view (UNN-467, rebuilt on v2 view builders) ────────
  const [modalOpen, setModalOpen] = useState(false)
  const [selectedCombatantId, setSelectedCombatantId] =
    useState<ParticipantId | null>(null)

  // React Compiler memoizes these by their data deps — one resolveSession per
  // optimistic frame, every read below folding over the same resolved view.
  const resolved = resolveSession(state.session, state.mapInstance)
  const view = buildConsoleView(state.session, resolved)
  const { currentActor } = view
  const roster = buildRosterView(
    state.session,
    resolved,
    state.mapInstance,
    participantMeta
  )
  const zones = buildZoneOverview(state.mapInstance, resolved)
  const fallenPcNames = roster.players
    .filter((row) => row.isFallen)
    .map((row) => row.name)

  const phase: ConsolePhase =
    currentActor === null
      ? "drafting"
      : !currentActor.hasActed
        ? "active"
        : modalOpen
          ? "resolving"
          : "drafting"

  const selectedDetail =
    selectedCombatantId !== null
      ? combatantDetail(
          state.session,
          resolved,
          state.mapInstance,
          selectedCombatantId,
          participantMeta[selectedCombatantId],
          durableHydrationById[selectedCombatantId]
        )
      : null

  const obligations =
    currentActor !== null
      ? endOfTurnObligations(resolved, currentActor.id)
      : null

  // One realtime listener per durable participant in the (optimistic) roster,
  // keyed by character shortId — deduped, since a character could in principle
  // occupy two slots (UNN-373).
  const pcChannelIds = dedupeByCharacter(
    state.session.participants.flatMap((participant) => {
      const meta = participantMeta[participant.id]
      return meta?.storage === "durable" && meta.characterShortId !== ""
        ? [{ characterId: meta.characterId, shortId: meta.characterShortId }]
        : []
    })
  )

  function onEndTurn() {
    dispatch({ kind: "endTurn" })
    setModalOpen(true)
  }

  return {
    session: state.session,
    instance: state.mapInstance,
    isPending,
    dispatch,
    dispatchWrite,
    endEncounter,
    onPcPing,
    // derived combat view
    view,
    currentActor,
    roster,
    zones,
    fallenPcNames,
    obligations,
    phase,
    pcChannelIds,
    // selection + end-of-turn modal
    selectedDetail,
    selectCombatant: setSelectedCombatantId,
    endOfTurnOpen: modalOpen && phase === "resolving",
    closeEndOfTurn: () => setModalOpen(false),
    onEndTurn,
    onDraft: (participantId: ParticipantId) =>
      dispatch({ kind: "draftCombatant", participantId }),
    onAdvanceRound: () => dispatch({ kind: "advanceRound" }),
  }
}

function dedupeByCharacter(
  channels: { characterId: string; shortId: string }[]
): { characterId: string; shortId: string }[] {
  const seen = new Set<string>()
  return channels.filter((channel) => {
    if (seen.has(channel.characterId)) return false
    seen.add(channel.characterId)
    return true
  })
}
