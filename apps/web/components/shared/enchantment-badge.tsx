import { MusicNotesIcon } from "@phosphor-icons/react"

import { Badge } from "@workspace/ui/components/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import type { ZoneEnchantmentBadge } from "@/domain/combat/view/zone-enchantment-badge"

/**
 * The Zone's Enchantment badge: name + the Forte as its dynamic marking
 * (*f / ff / fff*, italic serif like a score). Hovering reveals the rules the
 * current Forte grants — only the reached lines, each prefixed with the Forte
 * marking that grants it. The marking is decoration for screen readers; the
 * sr-only text speaks the Forte as a number. Shared by the encounter
 * {@link import("@/components/encounter/zone-layout").ZoneLayout} and the dungeon combat zone card so
 * both surfaces read the active Enchantment identically.
 */
export function EnchantmentBadge({
  enchantment,
}: {
  enchantment: ZoneEnchantmentBadge
}) {
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant="secondary" data-testid="zone-enchantment-badge">
            <MusicNotesIcon aria-hidden />
            {enchantment.name}
            {" — "}
            <ForteMarking marking={enchantment.marking} />
            <span className="sr-only">Forte {enchantment.forte}</span>
          </Badge>
        }
      />
      <TooltipContent className="flex-col items-start gap-1">
        {enchantment.lines
          .filter((line) => line.active)
          .map((line) => (
            <p key={line.forte} className="flex gap-1.5">
              <ForteMarking marking={"f".repeat(line.forte)} />
              <span className="sr-only">Forte {line.forte}:</span>
              <span>{line.text}</span>
            </p>
          ))}
      </TooltipContent>
    </Tooltip>
  )
}

/** A dynamic marking (*f / ff / fff*) rendered as on a score: italic bold
 *  serif. Decorative — pair with sr-only text naming the Forte. */
function ForteMarking({ marking }: { marking: string }) {
  return (
    <em aria-hidden className="shrink-0 font-serif font-bold italic">
      {marking}
    </em>
  )
}
