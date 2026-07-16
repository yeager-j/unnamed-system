"use client"

import { SwordIcon } from "@phosphor-icons/react/dist/ssr"

import { OccupantToken } from "@/components/shared/canvas/set-piece/occupant-chips"
import type { SetPieceOccupant } from "@/domain/map/view/set-piece-view"

/**
 * A combat roster token that opens the {@link import("@/components/combat/drawer/combatant-drawer").CombatantDrawer} —
 * the tappable chip shared by the battlefield card's Closeup grid and the roster
 * inspector (§D7), so both open the same detail surface with the same treatment.
 * It `stopPropagation()`s so a token tap never doubles as a zone click (AC 6), and
 * carries the acting combatant's white sword. Engine-free (the caller brands the
 * key): `occupant.key` is the combatant's participant id.
 */
export function CombatRosterToken({
  occupant,
  onSelect,
}: {
  occupant: SetPieceOccupant
  onSelect: (participantKey: string) => void
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation()
        onSelect(occupant.key)
      }}
      aria-label={`${occupant.name} details`}
      className="cursor-pointer rounded-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:outline-none"
    >
      <OccupantToken
        occupant={occupant}
        trailing={
          occupant.acting ? (
            <SwordIcon weight="fill" className="size-3 shrink-0" aria-hidden />
          ) : null
        }
      />
    </button>
  )
}
