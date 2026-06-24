import { z } from "zod/v4"

/**
 * The **Resources** component (D26) — an entity's derivable consumable spend-pools,
 * stored as `used` counts (the uniform depletion model, generalizing Vitals'
 * `damage`/`spSpent`). Each pool's *max* is resolved (dice from level; Prisma from
 * the upgrade tree when it ships), and `current = max − used`. Durable state (D11).
 *
 * `prismaUsed` is stored now even though Prisma has no resolved maximum yet — the
 * upgrade tree that derives it is unshipped, so `applyUsePrisma` takes the max as a
 * parameter and `resolve` emits no Prisma maximum until the tree lands
 * (forward-compatible, D26). Each field defaults to `0` (full pools) so a row
 * persisted before this component existed still loads (D3).
 */
export const resourcesSchema = z.object({
  hitDiceUsed: z.number().int().default(0),
  skillDiceUsed: z.number().int().default(0),
  prismaUsed: z.number().int().default(0),
})

export type Resources = z.infer<typeof resourcesSchema>
