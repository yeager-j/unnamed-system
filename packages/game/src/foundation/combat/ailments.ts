import { z } from "zod/v4"

/**
 * The twelve Ailments (rulebook 3.7). Downed is included and is the only
 * Ailment that can coexist with another. `key` is a slug; `description` is the
 * player-facing effect text shown on the sheet. Combat resolution (Technicals,
 * saving throws) is intentionally not modelled — the app tracks, it does not
 * resolve.
 */
export const AILMENT_KEYS = [
  "downed",
  "burn",
  "freeze",
  "shock",
  "dizzy",
  "forget",
  "sleep",
  "confuse",
  "fear",
  "despair",
  "rage",
  "brainwash",
] as const

export type AilmentKey = (typeof AILMENT_KEYS)[number]

export const ailmentSchema = z.object({
  key: z.enum(AILMENT_KEYS),
  name: z.string().min(1),
  description: z.string().min(1),
})

export type Ailment = z.infer<typeof ailmentSchema>
