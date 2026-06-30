/**
 * The single source of truth for dungeon token-chip styling.
 *
 * The side distinction (players = blue, enemies = red) and the two highlights are
 * declared **once** here. Every chip — the shared {@link import("./token-chip").TokenChip}
 * shell used by combat / explore / watch, and the Setup toggle that keeps its own
 * layout — reads its tint from these maps instead of re-declaring `blue-700` /
 * `red-700` inline. Retokenize a side to brand colours in exactly one place and
 * every chip follows.
 *
 * The two highlights are structurally different and must not be conflated:
 * - **acting** (the combatant whose turn it is) is a gold *ring over* the side tint.
 * - **owned** (the watch viewer's own character) *replaces* the side tint with a
 *   gold one — gold bg + border, **no ring** (the ring is reserved for acting).
 */

export type TokenSide = "players" | "enemies"

type TokenTint = { chip: string; name: string; initials: string }

/** Per-side tint: the chip's border/bg, the name colour, and the initials square. */
export const TOKEN_SIDE_STYLES: Record<TokenSide, TokenTint> = {
  players: {
    chip: "border-blue-700 bg-blue-700/10",
    name: "text-secondary-foreground",
    initials: "bg-blue-700/20 text-blue-100",
  },
  enemies: {
    chip: "border-red-700 bg-red-700/10",
    name: "text-secondary-foreground",
    initials: "bg-red-700/20 text-red-100",
  },
}

/**
 * The signed-in viewer's own character on the watch view — a gold self-tint that
 * replaces the side tint. No ring: the ring is the acting combatant's alone.
 */
export const TOKEN_OWNED_STYLE: TokenTint = {
  chip: "border-gold bg-gold/10",
  name: "text-secondary-foreground",
  initials: "bg-gold/20 text-gold",
}

/** The acting combatant's gold ring, layered over the side tint. */
export const TOKEN_ACTING_RING =
  "ring-2 ring-white ring-offset-1 ring-offset-card"
