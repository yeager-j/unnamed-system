"use client"

import {
  dispatchCombatEvent,
  type ConsoleDispatchEvent,
} from "@/components/combat/console/dispatch-event"
import type { EncounterForDM } from "@/domain/combat/load-encounter-for-dm"
import { useCombatPredictions } from "@/domain/combat/use-combat-predictions"

export function useEncounterSetup(data: EncounterForDM) {
  const root = useCombatPredictions({ canon: data.canon })

  function dispatch(event: ConsoleDispatchEvent) {
    dispatchCombatEvent({ event, encounterId: data.encounter.id, root })
  }

  return {
    state: root.value,
    isPending: root.status.pending > 0,
    dispatch,
  }
}
