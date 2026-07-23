"use client"

import { toast } from "sonner"

import { createNextPredictedRoot } from "@workspace/headcanon/next/client"
import { createPredictedRootContext } from "@workspace/headcanon/react"

import { characterProtocol } from "@/domain/character/commit/protocol"
import { applyCharacterMutationAction } from "@/lib/actions/character/mutations/apply"
import { axisInvalidations } from "@/lib/realtime/axis-invalidations"
import { mutationRecoveryToasts } from "@/lib/sync/mutation-recovery-toasts"

const characterRecoveryListeners = mutationRecoveryToasts({
  scope: "character",
  messages: {
    delivery: "Connection lost mid-save — your change is kept.",
    freshness: "Couldn't confirm your latest changes.",
    conflict:
      "A pending change was rolled back — this character changed elsewhere.",
  },
})

/**
 * The character surfaces' Headcanon root family (P2d — UNN-676): the first
 * `createNextPredictedRoot` consumer. Everything hard lives behind the package —
 * one ordered delivery queue, the private lifecycle ledger, ambiguous-delivery
 * retry with a stable mutation id, replay over every newer canon, accepted-vector
 * canonization, refresh coalescing, stall detection, and Next control-flow
 * preservation (`unstable_rethrow` before an ordinary throw becomes
 * `delivery: "uncertain"`).
 *
 * This module owns only the app's seams: the protocol, Server Action,
 * invalidation transport, and default lifecycle feedback.
 */

/**
 * `CharacterRoot.Provider`, mounted by `CharacterProvider`, binds the
 * generated action to the default App Router canon carrier (250 ms acceptance
 * grace) and lazy Ably axis invalidations. Character routes deliberately take
 * no polling fallback — parity with the ping-channel era they replace.
 */
export const useCharacterPredictions = createNextPredictedRoot({
  protocol: characterProtocol,
  action: applyCharacterMutationAction,
  invalidations: axisInvalidations,
  recoveryListeners: characterRecoveryListeners,
  mutationListeners: {
    onPrediction: (result) => {
      if (!result.ok) {
        toast.error(
          "That change can't apply to this character. Reload and try again."
        )
      }
    },
    onAcceptance: (result) => {
      if (
        !result.ok &&
        (result.error.kind === "domain" ||
          result.error.kind === "replay-refused")
      ) {
        toast.error("Couldn't save. Try again.")
      }
    },
  },
})

export const CharacterRoot = createPredictedRootContext(
  useCharacterPredictions,
  { name: "CharacterRoot" }
)
