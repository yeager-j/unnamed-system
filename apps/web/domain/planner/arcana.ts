/**
 * The Major Arcana vocabulary (phase 6 — UNN-579), transcribed from the
 * rulebook's Arcana Toolkit. `campaignNpc.arcana` stays **free text** storing
 * the display label (D8: advisory uniqueness only), so this list feeds the
 * picker without constraining the column.
 *
 * The Toolkit's own numbering is contiguous I–XIX and omits three cards; those
 * three are still offered (Jackson's call) under their traditional numerals,
 * carrying the Toolkit's `caution` so the picker can warn instead of hide.
 */
export interface ArcanaOption {
  numeral: string
  label: string
  /** The Toolkit's reasoning for why this card rarely suits an NPC. */
  caution?: string
}

export const ARCANA: readonly ArcanaOption[] = [
  {
    numeral: "0",
    label: "The Fool",
    caution:
      "The Fool embodies the player characters themselves — innocence, spontaneity, chaos — already at the table.",
  },
  { numeral: "I", label: "The Magician" },
  { numeral: "II", label: "The Priestess" },
  { numeral: "III", label: "The Empress" },
  { numeral: "IV", label: "The Emperor" },
  { numeral: "V", label: "The Hierophant" },
  { numeral: "VI", label: "The Lovers" },
  { numeral: "VII", label: "The Chariot" },
  { numeral: "VIII", label: "Justice" },
  { numeral: "IX", label: "The Hermit" },
  { numeral: "X", label: "Wheel of Fortune" },
  { numeral: "XI", label: "Strength" },
  { numeral: "XII", label: "The Hanged Man" },
  { numeral: "XIII", label: "Death" },
  { numeral: "XIV", label: "Temperance" },
  { numeral: "XV", label: "The Devil" },
  { numeral: "XVI", label: "The Tower" },
  { numeral: "XVII", label: "The Star" },
  { numeral: "XVIII", label: "The Moon" },
  { numeral: "XIX", label: "The Sun" },
  {
    numeral: "XX",
    label: "Judgement",
    caution:
      "Judgement is a moment of reckoning for the party, not a character — consider staging the confrontation instead.",
  },
  {
    numeral: "XXI",
    label: "The World",
    caution:
      "The World is a completed journey — a character with no room left to grow is nearly impossible to write.",
  },
]
