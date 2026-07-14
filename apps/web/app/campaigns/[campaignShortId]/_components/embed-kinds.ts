import { EMBED_TOKEN_SOURCE, parseEmbedToken } from "@/domain/planner/chip"
import type {
  ParticipantKind,
  ParticipantRef,
} from "@/domain/planner/participant"
import { dungeonConsolePath, encounterConsolePath } from "@/lib/paths"

/**
 * Which participant kinds render a block embed card, and where the card's
 * click-through routes (UNN-624, embeds mini-design decision 3). A registry so
 * an npc/article card is a later entry, not a redesign; a `![[…]]` of any
 * other kind degrades to a literal `!` + the inline pill by construction.
 *
 * Shared by the editor's `notes/embed-blocks.ts` widget and the display path's
 * `embed-card.tsx` — kept CM6-free so the display bundle doesn't drag the
 * editor in.
 */
export const EMBED_CARD_ROUTES: Partial<
  Record<ParticipantKind, (campaignShortId: string, shortId: string) => string>
> = {
  encounter: encounterConsolePath,
  dungeon: dungeonConsolePath,
}

/** Whether a `![[kind:…]]` token embeds as a block card (vs degrading to `!` + pill). */
export function isEmbeddableKind(kind: ParticipantKind): boolean {
  return EMBED_CARD_ROUTES[kind] !== undefined
}

const EMBED_LINE_RE = new RegExp(`^${EMBED_TOKEN_SOURCE}$`)

/**
 * The whole-line embed rule, decided once for both renderers (the editor's
 * `embed-blocks` field and chip-prose's rewrite): a line renders a block card
 * iff its trimmed text is exactly one embed token of an embeddable kind.
 * Returns that token's ref, or `null` for every other line.
 */
export function parseEmbedLine(lineText: string): ParticipantRef | null {
  const trimmed = lineText.trim()
  if (!trimmed.startsWith("!") || !EMBED_LINE_RE.test(trimmed)) return null
  const ref = parseEmbedToken(trimmed)
  if (ref === null || !isEmbeddableKind(ref.kind)) return null
  return ref
}
