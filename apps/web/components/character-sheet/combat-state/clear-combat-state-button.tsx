"use client"

import { EraserIcon } from "@phosphor-icons/react"

import { Button } from "@workspace/ui/components/button"

import { useCharacterWrite } from "@/hooks/use-character"
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
export function ClearCombatStateButton({ hasState }: { hasState: boolean }) {
  const { pending, write, characterId } = useCharacterWrite()

  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      disabled={pending || !hasState}
      onClick={() =>
        write({
          edit: { kind: "clearCombatState" },
          surface: "clearCombatState",
          action: (expectedVersion) =>
            clearCombatStateAction({ characterId, expectedVersion }),
        })
      }
    >
      <EraserIcon weight="regular" aria-hidden />
      Clear
    </Button>
  )
}
