"use client"

import { EraserIcon } from "@phosphor-icons/react"
import { useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@workspace/ui/components/button"

import { dispatchCharacterWriteWithRetry } from "@/hooks/dispatch-character-write"
import { useCharacterTokenRef } from "@/hooks/use-character-token-ref"
import { clearCombatStateAction } from "@/lib/actions/combat-state"

/**
 * The header-right "Clear" reset on the Combat State card (UNN-226). Wipes
 * Ailments, all three Battle Condition axes, Charged, and Concentrating in
 * one server round-trip. Exhaustion is dungeoneering state and only Full
 * Rest reduces it, so the reset deliberately leaves it alone (PRD §3.7 /
 * UNN-156). No confirmation dialog per the ticket — easy to redo by hand if
 * mis-clicked.
 *
 * The button disables when nothing is set to clear so a stray click on the
 * already-clean card doesn't fire a no-op write (and waste a vitalsVersion
 * bump that would stale a debounced sibling save).
 */
export function ClearCombatStateButton({
  characterId,
  vitalsVersion,
  hasState,
}: {
  characterId: string
  vitalsVersion: number
  hasState: boolean
}) {
  const versionRef = useCharacterTokenRef(vitalsVersion)
  const [pending, startTransition] = useTransition()

  function handleClick() {
    startTransition(async () => {
      const result = await dispatchCharacterWriteWithRetry({
        characterId,
        characterClass: "vitals",
        versionRef,
        action: (expectedVersion) =>
          clearCombatStateAction({ characterId, expectedVersion }),
      })
      if (result.ok) return
      if (result.error === "stale") {
        toast.error("Couldn't sync — refresh to see the latest.")
      } else {
        toast.error("Couldn't save. Try again.")
      }
    })
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending || !hasState}
      onClick={handleClick}
    >
      <EraserIcon weight="regular" aria-hidden />
      Clear
    </Button>
  )
}
