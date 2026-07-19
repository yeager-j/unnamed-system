import { z } from "zod/v4"

import type { ProcessRefusal } from "@workspace/replica/server"

import type { CombatReplicaRejection } from "@/domain/combat/replica/rejection"

/**
 * The combat replica doors' wire (UNN-646), the sibling of
 * `entity/replica/wire.schema.ts` — same rules: the envelope carries only
 * client identity (the root binding is Showtime's, riding beside it), and
 * `args` stays `unknown` so the authority's parse is the registry's `decode`
 * inside the processor, where a failed decode is RECORDED against the
 * watermark (deploy skew) instead of bouncing at the door.
 *
 * Two push doors, not one with a home discriminant: each door can only write
 * its own home, so a tampered or confused client claim fails closed at the
 * other door's decode/locator check rather than routing anything.
 */
const envelopeSchema = z.object({
  clientGroupId: z.string().min(1),
  clientId: z.string().min(1),
  mutationId: z.number().int().positive(),
  invocation: z.object({
    name: z.string().min(1),
    args: z.unknown(),
  }),
})

/** Durable home: one `combat.entity.write` delivery against one entity row.
 *  `encounterId` is the console's revalidation context, not authority truth —
 *  it is campaign-verified before revalidating and never gates the write. */
export const CombatDurablePushSchema = z.object({
  encounterId: z.string().min(1),
  entityId: z.string().min(1),
  envelope: envelopeSchema,
})

export type CombatDurablePushInput = z.input<typeof CombatDurablePushSchema>

/** Inline home: one `combat.session.write` delivery against the session blob. */
export const CombatSessionPushSchema = z.object({
  encounterId: z.string().min(1),
  envelope: envelopeSchema,
})

export type CombatSessionPushInput = z.input<typeof CombatSessionPushSchema>

export type CombatPushError =
  | "invalid-input"
  | ProcessRefusal<CombatReplicaRejection>

/** The session door's non-void Remote: the encounter version this commit
 *  produced, folded into the console's surviving event-queue token so the two
 *  protocols sharing the encounter row keep each other fresh (UNN-646; design
 *  Open decision 6's first recorded-remote use). */
export interface CombatSessionRemote {
  readonly version: number
}

const identitySchema = z.object({
  clientGroupId: z.string().min(1),
  clientId: z.string().min(1),
})

/**
 * The batched bootstrap request: one action registers the inline identity
 * plus every durable identity and returns all accepted tuples. Server Actions
 * execute serially per tab, so N per-root reads at console mount would be
 * sequential round-trips; late joiners and expiry rebuilds call this with a
 * single element.
 */
export const CombatAcceptedRequestSchema = z.object({
  encounterId: z.string().min(1),
  inline: identitySchema.optional(),
  durable: z
    .array(z.object({ entityId: z.string().min(1), identity: identitySchema }))
    .default([]),
})

export type CombatAcceptedRequest = z.input<typeof CombatAcceptedRequestSchema>
