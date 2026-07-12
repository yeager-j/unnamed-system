import type { SlotTemplateEntry } from "@/lib/db/schema/campaign-clock"

/**
 * The default-slots template a fresh clock is minted with (D1; the handoff's
 * core model: "each day has ordered slots — by default Morning and Evening").
 * Editable per campaign afterward in Manage Campaign → "Day structure".
 */
export const DEFAULT_SLOT_TEMPLATE: SlotTemplateEntry[] = [
  { label: "Morning" },
  { label: "Evening" },
]
