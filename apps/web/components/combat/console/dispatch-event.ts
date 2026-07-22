import { toast } from "sonner"

import {
  combatEvent,
  type ConsoleCombatEvent,
} from "@/domain/combat/commit/protocol"
import { useCombatPredictions } from "@/domain/combat/use-combat-predictions"
import { combatErrorMessage } from "@/lib/actions/combat/error-message"

export type ConsoleDispatchEvent = ConsoleCombatEvent

export function dispatchCombatEvent({
  event,
  encounterId,
  root,
}: {
  event: ConsoleDispatchEvent
  encounterId: string
  root: ReturnType<typeof useCombatPredictions>
}) {
  const result = root.mutate(
    combatEvent({
      encounterId,
      event,
    })
  )
  if (!result.ok) {
    toast.error(combatErrorMessage(result.error))
    return null
  }
  void result.value.accepted.then((accepted) => {
    if (accepted.ok) return
    if (
      accepted.error.kind === "domain" ||
      accepted.error.kind === "replay-refused"
    ) {
      toast.error(combatErrorMessage(accepted.error.error))
    }
  })
  return result.value
}
