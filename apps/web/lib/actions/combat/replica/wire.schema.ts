import { z } from "zod/v4"

import type { ProcessRefusal } from "@workspace/replica/server"

import type { CombatReplicaRejection } from "@/domain/combat/replica/rejection"
import { ReplicaMutationEnvelopeSchema } from "@/lib/actions/replica/wire.schema"

/**
 * The combat replica doors' wire (UNN-646), the sibling of
 * `entity/replica/wire.schema.ts` — the envelope carries only client identity
 * while the root binding rides beside it. The shared schema owns the
 * args-stay-unknown rule.
 *
 * Two push doors, not one with a home discriminant: each door can only write
 * its own home, so a tampered or confused client claim fails closed at the
 * other door's decode/locator check rather than routing anything.
 */
/** Durable home: one `combat.entity.write` delivery against one entity row.
 *  `encounterId` scopes the delivery: the entity must still be a durable
 *  participant of that encounter (the classic router's fail-closed locator
 *  scope, checked in the door's verdict and RECORDED on refusal — Codex P2,
 *  PR #391), and it is separately campaign-verified before revalidating. */
export const CombatDurablePushSchema = z.object({
  encounterId: z.string().min(1),
  entityId: z.string().min(1),
  envelope: ReplicaMutationEnvelopeSchema,
})

export type CombatDurablePushInput = z.input<typeof CombatDurablePushSchema>

/** Encounter home: one `encounter.writeInline` delivery against the
 *  storage-native encounter root (UNN-655). */
export const CombatSessionPushSchema = z.object({
  encounterId: z.string().min(1),
  envelope: ReplicaMutationEnvelopeSchema,
})

export type CombatSessionPushInput = z.input<typeof CombatSessionPushSchema>

export type CombatPushError =
  | "invalid-input"
  | ProcessRefusal<CombatReplicaRejection>

/** The encounter door's non-void Remote: the encounter version this commit
 *  produced, folded into the console's surviving event-queue token so the two
 *  protocols sharing the encounter row keep each other fresh (UNN-646; design
 *  Open decision 6's first recorded-remote use). Kept by UNN-655 because the
 *  classic event wire (`useQueuedWrite`) still shares the row and its token
 *  cannot be kept fresh by the asynchronous accepted pull; **removal
 *  condition: UNN-656 retiring the encounter event queue**, at which point
 *  this becomes the default `Remote = void`. */
export interface CombatSessionRemote {
  readonly version: number
}

const identitySchema = z.object({
  clientGroupId: z.string().min(1),
  clientId: z.string().min(1),
})

/**
 * The batched bootstrap request: one action registers the encounter identity
 * plus every durable identity and returns all accepted tuples. Server Actions
 * execute serially per tab, so N per-root reads at console mount would be
 * sequential round-trips; late joiners and expiry rebuilds call this with a
 * single element.
 */
export const CombatAcceptedRequestSchema = z.object({
  encounterId: z.string().min(1),
  encounter: identitySchema.optional(),
  durable: z
    .array(z.object({ entityId: z.string().min(1), identity: identitySchema }))
    .default([]),
})

export type CombatAcceptedRequest = z.input<typeof CombatAcceptedRequestSchema>
