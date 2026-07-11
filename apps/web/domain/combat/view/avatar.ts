import type { CombatSide } from "@workspace/game-v2/kernel/vocab/combat"
import { initials } from "@workspace/ui/lib/initials"
import { avatarSrc } from "@workspace/ui/lib/portrait"

/**
 * A combatant's token art, resolved to a display variant: a PC renders a
 * portrait image (uploaded art, or the deterministic gradient fallback), an
 * inline combatant a side-tinted initials chip. The storage projection is
 * decided **once** in {@link combatantAvatar} — the rail token and the drawer
 * header render the variant and never re-ask PC-vs-enemy.
 */
export type CombatantAvatar =
  | { kind: "portrait"; src: string }
  | { kind: "initials"; label: string; side: CombatSide }

export function combatantAvatar(args: {
  isPc: boolean
  portraitUrl: string | null
  name: string
  /** The fallback avatar seed for a nameless combatant. */
  id: string
  side: CombatSide
}): CombatantAvatar {
  return args.isPc
    ? {
        kind: "portrait",
        src: avatarSrc(args.portraitUrl, args.name || args.id),
      }
    : { kind: "initials", label: initials(args.name), side: args.side }
}
