"use client"

import { useState } from "react"
import { toast } from "sonner"

import { VIRTUE_KEYS, type VirtueKey } from "@workspace/game-v2/kernel/vocab"
import {
  coerceVirtueAllocation,
  describeAllocationProgress,
  wouldExceedAllocationCap,
  ZERO_VIRTUE_ALLOCATION,
  type VirtueAllocation,
} from "@workspace/game-v2/virtues"
import { Button } from "@workspace/ui/components/button"
import { ButtonGroup } from "@workspace/ui/components/button-group"

import {
  useEntityWrite,
  useLoadedCharacter,
} from "@/domain/entity/use-entity-write"
import { VIRTUE_LABELS, VIRTUE_RANK_LABELS } from "@/domain/labels"

const RANKS = [0, 1, 2] as const

/**
 * Movement 2's Virtue allocator (ADR-002 §"Movement 2 — The Past"). Four
 * rows (Expression / Empathy / Wisdom / Focus), each a `ButtonGroup` of
 * three segmented buttons (○ / +1 / +2). Selected segment uses the primary
 * variant; the others use outline so the chosen state reads at a glance.
 *
 * Inline budget enforcement: buttons that would violate the one-+2 /
 * two-+1s rule render disabled so the player can see what's locked out
 * without trial-and-error. Clearing (○) is always enabled — the player
 * frees a slot by clicking it on the row currently holding the rank.
 *
 * Every state change dispatches a `virtues.setAllocation` descriptor
 * (progression class — the token routing is the provider's business). The
 * Writer's cap refusal (twos ≤ 1, ones ≤ 2) matches the UI's gating; the
 * Continue gate on this movement checks the full creation rule (one +2, two
 * +1s, all different).
 */
export function VirtuesControl() {
  const { entity } = useLoadedCharacter()
  const { dispatch } = useEntityWrite()
  // Derived from the entity's virtues component. React Compiler (UNN-241)
  // memoizes this on the underlying ranks, so its identity is stable across
  // re-renders that don't change them — exactly what the `previousAllocation`
  // sync below depends on.
  const allocation = coerceVirtueAllocation(
    entity.components.virtues?.ranks ?? ZERO_VIRTUE_ALLOCATION
  )
  // Local draft seeded from the server. Plain useState rather than
  // `useOptimistic` because rapid sequential clicks (e.g. +2 then +1 then
  // +1) would otherwise reset to the in-flight server prop between actions
  // and drop the intermediate intent — the next click would read the
  // pre-+2 state and overwrite the +2.
  //
  // `allocation`'s identity only changes when the underlying virtue columns
  // do, so we adopt it during render whenever it changes (React's "store
  // information from previous renders" pattern, in lieu of a `useEffect`
  // sync that would lag a frame and re-render twice).
  const [draft, setDraft] = useState<VirtueAllocation>(allocation)
  const [previousAllocation, setPreviousAllocation] = useState(allocation)
  if (allocation !== previousAllocation) {
    setPreviousAllocation(allocation)
    setDraft(allocation)
  }

  function applyAllocation(next: VirtueAllocation) {
    setDraft(next)
    dispatch(
      { component: "virtues", op: "setAllocation", ranks: next },
      {
        messages: {
          stale:
            "Someone else updated this character — refresh to see the latest.",
          error: "Couldn't save your Virtues. Try again.",
        },
        onError: (error) => {
          if (error === "entity-not-found") {
            toast.error("This character was deleted.")
            return true
          }
          return false
        },
      }
    )
  }

  function setRank(key: VirtueKey, rank: 0 | 1 | 2) {
    if (draft[key] === rank) return
    applyAllocation({ ...draft, [key]: rank })
  }

  const progress = describeAllocationProgress(draft)

  return (
    <section className="flex flex-col gap-4">
      <header className="flex flex-col gap-1">
        <h2 className="font-heading text-lg font-medium text-foreground">
          Virtues
        </h2>
        <p className="text-xs text-muted-foreground">
          {progress.valid
            ? "Allocation complete."
            : "One Virtue at +2, two more at +1 — pick your strongest, then two that are also strong."}
        </p>
      </header>

      <div className="flex flex-col gap-2">
        {VIRTUE_KEYS.map((key) => (
          <div
            key={key}
            className="flex items-center justify-between gap-4"
            data-virtue={key}
          >
            <span className="text-sm text-foreground">
              {VIRTUE_LABELS[key]}
            </span>
            <ButtonGroup aria-label={`${VIRTUE_LABELS[key]} rank`}>
              {RANKS.map((rank) => {
                const isSelected = draft[key] === rank
                const isDisabled = wouldExceedAllocationCap(draft, key, rank)
                return (
                  <Button
                    key={rank}
                    type="button"
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    aria-pressed={isSelected}
                    disabled={isDisabled}
                    onClick={() => setRank(key, rank)}
                    className="font-mono tabular-nums"
                  >
                    {VIRTUE_RANK_LABELS[rank]}
                  </Button>
                )
              })}
            </ButtonGroup>
          </div>
        ))}
      </div>
    </section>
  )
}
