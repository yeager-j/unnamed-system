/**
 * Combat **side** + **advantage** vocabulary, re-declared in v2 (D32). Shared
 * vocab referenced by both the `encounter/` domain (a `Session`'s `advantage`/
 * `firstSide` scalars and the `Allegiance` overlay's `side`) and the future
 * `visibility/` domain (relationship = f(viewer, allegiance)). Homed in
 * `kernel/vocab` — zod-free, like {@link import("./enchantment").ENCHANTMENT_TYPES}
 * — so the two domains never cross-import a sibling; mirrors v1's neutral
 * `foundation/encounter/session.ts` constants.
 */

/**
 * The two sides a combatant can belong to. A PC is not pinned to `players` — a
 * charmed PC or a summoned NPC ally can sit on either side — so `side` is
 * orthogonal to whether a combatant is a PC or a free-entered enemy.
 */
export const COMBAT_SIDES = ["players", "enemies"] as const

export type CombatSide = (typeof COMBAT_SIDES)[number]

/**
 * The opening-advantage declaration a DM makes for an encounter.
 * `players`/`enemies` = that side takes all its opening turns before the other
 * acts; `neutral` = standard alternating order from round one. Distinct from
 * {@link CombatSide} by the extra `neutral` arm — advantage is "who, if anyone,
 * gets the jump", not a side a combatant belongs to.
 */
export const COMBAT_ADVANTAGES = ["players", "enemies", "neutral"] as const

export type CombatAdvantage = (typeof COMBAT_ADVANTAGES)[number]
