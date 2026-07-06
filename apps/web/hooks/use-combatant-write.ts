"use client"

import { useRef, useTransition } from "react"
import { toast } from "sonner"

import type { ComponentRegistry } from "@workspace/game-v2/kernel"
import type { ParticipantId } from "@workspace/game-v2/kernel/participant-id.schema"
import { err, type Result } from "@workspace/game/foundation"

import type { ParticipantMeta } from "@/app/combat/[shortId]/encounter-access"
import type { UseQueuedWriteReturn } from "@/hooks/use-queued-write"
import type { MonotonicVersionMap } from "@/hooks/version-token-store"
import { applyCombatantWriteAction } from "@/lib/actions/combat/commit/apply-combatant-write"
import type { ApplyCombatantWriteError } from "@/lib/actions/combat/commit/apply-combatant-write.schema"
import type { CommittedWrite } from "@/lib/actions/combat/commit/stores"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"
import { getCombatantVitalsVersionAction } from "@/lib/actions/combat/vitals-version"
import type { ConsoleOptimisticAction } from "@/lib/combat/console-optimistic"
import type { CombatEntityWrite } from "@/lib/entity/commit/write.schema"
import { applyEntityWrite, type WriterDeps } from "@/lib/entity/commit/writers"

export type DispatchCombatantWrite = (
  participantId: ParticipantId,
  write: CombatEntityWrite,
  deps: WriterDeps
) => Promise<Result<CommittedWrite, ApplyCombatantWriteError>>

/**
 * The console's **combatant component-write dispatcher** (the moved UNN-520 AC;
 * UNN-535) — the client half of the CD19 write-router. It owns **no**
 * `useOptimistic` of its own: the prediction is pushed into the console's one
 * optimistic container as a `{ kind: "write" }` action, whose reducer applies
 * the Writer patch **to the participant in the current frame** — the structural
 * UNN-226 fix (a post-state never travels in the action, so back-to-back
 * damage clicks sum instead of clobbering).
 *
 * What it does own is **dispatch + token accounting**, routed by the
 * participant's storage home (read off the loader-projected
 * {@link ParticipantMeta} — the client's belief; the server re-derives it
 * authoritatively):
 *
 * - **inline** → the **encounter queue**: `CommittedWrite.version` is the
 *   bumped encounter version, so the queue's serialized enqueue + one-shot
 *   stale-retry fold it into the encounter ref exactly like any session event.
 * - **durable** → a **per-character serialized promise chain** against the
 *   console's monotonic `vitalsVersion` map, with its own one-shot stale-retry
 *   through {@link getCombatantVitalsVersionAction}. The returned `version` is
 *   the character `vitalsVersion` — it must **never** touch the encounter
 *   queue's ref (the durable write doesn't bump the encounter row).
 *
 * `deps` comes from the drawer's view model (the resolved caps — see
 * {@link WriterDeps}), never the wire: the Writers validate against values the
 * client derived from its own resolved frame, and the server re-derives its
 * own. A Writer **refusal** from the local pre-check short-circuits before any
 * dispatch — programmer-bug tier (the affordance shouldn't have rendered), so
 * it toasts and never hits the network. Every failure toasts here (the one
 * error-copy home), and the result is returned for callers that care.
 */
export function useCombatantWrite({
  encounterId,
  encounterWrite,
  characterVersions,
  metaOf,
  componentsOf,
  applyOptimistic,
}: {
  encounterId: string
  encounterWrite: UseQueuedWriteReturn
  characterVersions: MonotonicVersionMap<string>
  metaOf: (participantId: ParticipantId) => ParticipantMeta | undefined
  componentsOf: (
    participantId: ParticipantId
  ) => Partial<ComponentRegistry> | undefined
  applyOptimistic: (action: ConsoleOptimisticAction) => void
}): { dispatchWrite: DispatchCombatantWrite } {
  const durableChains = useRef(new Map<string, Promise<unknown>>())
  const [, startTransition] = useTransition()

  // The whole dispatch runs as one async transition owned HERE — the mirror
  // (`applyOptimistic`) targets the console's `useOptimistic` container, and an
  // optimistic update outside a transition both warns and reverts immediately
  // instead of holding until the action settles. Drawer controls call
  // `dispatchWrite` bare, so the hook can't rely on callers wrapping it. The
  // resolve-inside-transition shape keeps the caller-visible Promise<Result>.
  const dispatchWrite: DispatchCombatantWrite = (participantId, write, deps) =>
    new Promise((resolve) => {
      startTransition(async () => {
        resolve(await runWrite(participantId, write, deps))
      })
    })

  const runWrite: DispatchCombatantWrite = async (
    participantId,
    write,
    deps
  ) => {
    const components = componentsOf(participantId)
    if (components === undefined) {
      toast.error(combatErrorMessage("participant-not-found"))
      return err("participant-not-found")
    }
    const predicted = applyEntityWrite(components, write, deps)
    if (!predicted.ok) {
      toast.error(combatErrorMessage(predicted.error))
      return predicted
    }

    applyOptimistic({ kind: "write", participantId, write, deps })

    const meta = metaOf(participantId)
    const result =
      meta?.storage === "durable"
        ? await enqueueDurable(meta.characterId, () =>
            commitDurable(
              meta.characterId,
              meta.vitalsVersion,
              participantId,
              write
            )
          )
        : await encounterWrite.enqueue((expectedVersion) =>
            applyCombatantWriteAction({
              encounterId,
              expectedVersion,
              participantId,
              write,
            })
          )

    if (!result.ok) toast.error(combatErrorMessage(result.error))
    return result
  }

  /** Serializes durable writes per character, so a rapid damage-then-heal on
   *  one PC reads the freshly-bumped `vitalsVersion` its predecessor produced. */
  function enqueueDurable(
    characterId: string,
    commit: () => Promise<Result<CommittedWrite, ApplyCombatantWriteError>>
  ): Promise<Result<CommittedWrite, ApplyCombatantWriteError>> {
    const chain = durableChains.current.get(characterId) ?? Promise.resolve()
    const run = chain.then(commit)
    durableChains.current.set(
      characterId,
      run.catch(() => {})
    )
    return run
  }

  async function commitDurable(
    characterId: string,
    seedVersion: number,
    participantId: ParticipantId,
    write: CombatEntityWrite
  ): Promise<Result<CommittedWrite, ApplyCombatantWriteError>> {
    const dispatch = (expectedCharacterVersion: number) =>
      applyCombatantWriteAction({
        encounterId,
        // The durable store guards on the character token; the encounter token
        // rides along to satisfy the shared envelope and is read fresh.
        expectedVersion: encounterWrite.versionRef.current,
        expectedCharacterVersion,
        participantId,
        write,
      })

    const first = await dispatch(
      characterVersions.read(characterId) ?? seedVersion
    )
    if (first.ok) {
      characterVersions.bump(characterId, first.value.version)
      return first
    }
    if (first.error !== "stale") return first

    const fresh = await getCombatantVitalsVersionAction({ characterId })
    if (!fresh.ok) return first
    characterVersions.bump(characterId, fresh.value.version)

    const second = await dispatch(
      characterVersions.read(characterId) ?? fresh.value.version
    )
    if (second.ok) characterVersions.bump(characterId, second.value.version)
    return second
  }

  return { dispatchWrite }
}
