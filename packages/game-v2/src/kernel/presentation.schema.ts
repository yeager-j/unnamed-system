import { z } from "zod/v4"

/**
 * The **Presentation** component: an entity's cosmetic display metadata. Today
 * that is just `portraitUrl` — the token art a battlefield/roster surface draws,
 * `undefined` when the entity falls back to a gradient/initials placeholder.
 *
 * It is deliberately **cosmetic only** (F4): no `kind` provenance union (a charmed
 * PC is not "an enemy" because it fights on the enemies side — "is this a PC?"
 * routes through a capability or the durable `entity.kind` column, never a
 * component flag), and no display `name` (that is {@link
 * import("./identity.schema").Identity}'s single job). Kept separate from
 * `Identity` precisely so the two flow through the per-component redaction pass
 * independently: `presentation` is public to **every** viewer (an enemy's portrait
 * is observable battlefield art), whereas `attributes`/`affinities` drop to
 * opponents — see `visibility/`.
 *
 * Like {@link import("./identity.schema").Identity}, it is universal (any entity —
 * PC, enemy, NPC, object — may carry one) rather than belonging to a single
 * domain, so it is homed in `kernel/`, and `resolve` passes it through verbatim
 * (authored == effective) so it has a resolved surface for redaction to fold over.
 */
export const presentationSchema = z.object({
  portraitUrl: z.string().optional(),
})

export type Presentation = z.infer<typeof presentationSchema>
