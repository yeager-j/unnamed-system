import {
  NARRATIVE_TEXT_FIELDS,
  type Narrative,
  type NarrativeTextField,
} from "@workspace/game-v2/narrative"

/**
 * The NPC page's document rail (UNN-579): the eight `narrative` text fields
 * grouped Origins / Identity, one editable at a time — the builder's animus
 * experience with DM-facing copy (the builder's `IDENTITY_TRAIT_MESSAGES`
 * speaks to a player about *their* character; these speak to the DM about a
 * person they're writing).
 */
export interface NpcDocumentMessages {
  label: string
  placeholder: string
}

export interface NpcDocumentGroup {
  label: string
  fields: readonly NarrativeTextField[]
}

export const NPC_DOCUMENT_GROUPS: readonly NpcDocumentGroup[] = [
  { label: "Origins", fields: ["ancestry", "background", "backstory"] },
  {
    label: "Identity",
    fields: ["personality", "hopes", "dreams", "fears", "secrets"],
  },
]

/** The eight text fields flattened for the editors (nulls become ""). */
export function npcNarrativeTexts(
  narrative: Narrative | null
): Record<NarrativeTextField, string> {
  return Object.fromEntries(
    NARRATIVE_TEXT_FIELDS.map((field) => [field, narrative?.[field] ?? ""])
  ) as Record<NarrativeTextField, string>
}

/** Resolves the `?doc=` param to a pane — anything unrecognized is Overview. */
export function npcPaneFromParam(
  param: string | null
): NarrativeTextField | "overview" {
  return NARRATIVE_TEXT_FIELDS.includes(param as NarrativeTextField)
    ? (param as NarrativeTextField)
    : "overview"
}

/**
 * Per-field emptiness for the doc rail's muted rows — the NPCs layout builds
 * this for every live NPC so the rail (which the layout-owned sidebar
 * renders on detail routes) knows which documents hold prose.
 */
export function npcDocEmptiness(
  narrative: Narrative | null
): Record<NarrativeTextField, boolean> {
  return Object.fromEntries(
    NARRATIVE_TEXT_FIELDS.map((field) => [
      field,
      (narrative?.[field] ?? "").trim() === "",
    ])
  ) as Record<NarrativeTextField, boolean>
}

export const NPC_DOCUMENT_MESSAGES: Record<
  NarrativeTextField,
  NpcDocumentMessages
> = {
  ancestry: {
    label: "Ancestry",
    placeholder: "Where their people come from — bloodline, homeland, kin.",
  },
  background: {
    label: "Background",
    placeholder:
      "What they did before the party met them — trade, station, craft.",
  },
  backstory: {
    label: "Backstory",
    placeholder:
      "The story so far — what shaped them, what they lost, what they carry.",
  },
  personality: {
    label: "Personality",
    placeholder: "- Blunt\n- Slow to anger\n- Taps the table when lying",
  },
  hopes: {
    label: "Hopes",
    placeholder: "Short-term goals they're actively working toward.",
  },
  dreams: {
    label: "Dreams",
    placeholder: "The larger-than-life goal they can't reach alone.",
  },
  fears: {
    label: "Fears",
    placeholder: "What paralyzes them, and the wound each fear grew from.",
  },
  secrets: {
    label: "Secrets",
    placeholder: "What they'd be devastated to see revealed.",
  },
}
