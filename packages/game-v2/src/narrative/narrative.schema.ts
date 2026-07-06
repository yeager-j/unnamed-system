import { z } from "zod/v4"

/**
 * One **Knife** or **Chain** — an identity beat (Character Building 1.5). Display
 * order is the array index (v1's `order` column is dropped). `description` is
 * nullable: a titled beat may carry no elaboration.
 */
export const identityBeatSchema = z.object({
  title: z.string(),
  description: z.string().nullable(),
})

export type IdentityBeat = z.infer<typeof identityBeatSchema>

/**
 * The **Narrative** component (CH16) — the rulebook's authored identity content:
 * Ancestry, Background, Backstory, the Identity Traits (Personality / Hopes /
 * Dreams / Fears / Secrets), and the Knives / Chains lists (Character Building
 * 1.4/1.5). Rulebook constructs, so their shape is game-v2's to declare.
 *
 * A **pass-through** resolved read-unit (authored == effective, the `identity`
 * precedent) — but **dropped from every combat viewer** by the visibility table:
 * narrative never rides the encounter snapshot. Owner-vs-public gating of fields
 * like Secrets is the sheet's app-level read boundary, not the combat visibility
 * policy. Each text field is nullable (a present narrative may leave a field
 * blank); the Knives/Chains lists default empty.
 */
export const narrativeSchema = z.object({
  ancestry: z.string().nullable(),
  background: z.string().nullable(),
  backstory: z.string().nullable(),
  personality: z.string().nullable(),
  hopes: z.string().nullable(),
  dreams: z.string().nullable(),
  fears: z.string().nullable(),
  secrets: z.string().nullable(),
  knives: z.array(identityBeatSchema).default([]),
  chains: z.array(identityBeatSchema).default([]),
})

export type Narrative = z.infer<typeof narrativeSchema>
