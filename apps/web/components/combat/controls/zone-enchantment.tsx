"use client"

import { MusicNotesIcon } from "@phosphor-icons/react"

import {
  ENCHANTMENT_TYPES,
  ENCHANTMENTS_BY_TYPE,
  MAX_FORTE,
} from "@workspace/game-v2/mechanics"
import type { MapInstanceEvent } from "@workspace/game-v2/spatial"
import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import type { ZoneEnchantmentBadge } from "@/domain/combat/view/zone-overview"

interface ZoneEnchantmentControlProps {
  zoneId: string
  zoneName: string
  /** This zone's active Enchantment badge, or `undefined` when the Instance's
   *  Enchantment is absent or sits on another zone. */
  enchantment?: ZoneEnchantmentBadge
  onCombatEvent: (event: MapInstanceEvent) => void
  disabled?: boolean
}

/**
 * The DM's per-zone Enchantment menu (Bard mechanic): one item per Enchantment
 * type dispatching `applyEnchantment` — the item for the zone's current type
 * reads as a Forte raise and disables at {@link MAX_FORTE} — plus a clear item
 * when this zone holds the Enchantment. Routed through the console's existing
 * optimistic `dispatch`; the engine enforces the one-Enchanted-Zone rule, so
 * Enchanting here silently moves the singleton off any other zone.
 */
export function ZoneEnchantmentControl({
  zoneId,
  zoneName,
  enchantment,
  onCombatEvent,
  disabled,
}: ZoneEnchantmentControlProps) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant="ghost"
            size="icon-sm"
            disabled={disabled}
            aria-label={`Enchant ${zoneName}`}
          >
            <MusicNotesIcon />
          </Button>
        }
      />
      <DropdownMenuContent align="end">
        {ENCHANTMENT_TYPES.map((type) => {
          const current = enchantment?.type === type ? enchantment : undefined
          const atCap = current !== undefined && current.forte >= MAX_FORTE
          return (
            <DropdownMenuItem
              key={type}
              disabled={atCap}
              onClick={() =>
                onCombatEvent({
                  kind: "applyEnchantment",
                  zoneId,
                  enchantment: type,
                })
              }
            >
              {current
                ? atCap
                  ? `${current.name} — Forte ${MAX_FORTE} (max)`
                  : `${current.name} — raise Forte to ${current.forte + 1}`
                : ENCHANTMENTS_BY_TYPE[type].name}
            </DropdownMenuItem>
          )
        })}
        {enchantment ? (
          <DropdownMenuItem
            variant="destructive"
            onClick={() => onCombatEvent({ kind: "clearEnchantment" })}
          >
            Clear Enchantment
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
