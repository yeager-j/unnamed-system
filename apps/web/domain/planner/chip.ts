import {
  PARTICIPANT_KINDS,
  type ParticipantKind,
  type ParticipantRef,
} from "./participant"

/**
 * The chip-token grammar (tech-design D7): the inline participant token
 * embedded in markdown prose — `[[kind:id|label]]`. The id is authoritative;
 * the label is a readable fallback captured at insert time (render resolves
 * the current name through the participant resolver, so renames propagate and
 * tombstones mute). One neutral module consumed by the editor node, the
 * read-only renderer, the day-end pre-suggest, and the mention index.
 *
 * **Label sanitization:** captured labels strip `|`, `[`, and `]` — the three
 * characters that could break the token out of its own grammar. Fidelity loss
 * is nil because the id re-resolves the real name. Sanitization happens at
 * serialize (not just insert) so the emitted markdown is byte-deterministic —
 * the editor's echo-reset guard compares markdown strings.
 */

const KIND_ALTERNATION = PARTICIPANT_KINDS.join("|")

/**
 * The token pattern's source, exported for the editor's markdown tokenizer.
 * One capture per part: kind, id, label. Ids and labels exclude `|`/`[`/`]`
 * by construction (ids are UUIDs; labels are sanitized).
 */
export const CHIP_TOKEN_SOURCE = `\\[\\[(${KIND_ALTERNATION}):([^|\\[\\]]+)\\|([^|\\[\\]]*)\\]\\]`

/**
 * The embed-token pattern's source: `!` + the chip grammar (UNN-624). Same
 * captures (kind, id, label). Inert literal text in CommonMark — `![[…]]` has
 * no `(url)`, so it never parses as an image — which is what makes storage
 * purity and the `|label` degradation hold by construction.
 */
export const EMBED_TOKEN_SOURCE = `!${CHIP_TOKEN_SOURCE}`

const KIND_SET: ReadonlySet<string> = new Set(PARTICIPANT_KINDS)

/** Strips the grammar-breaking characters (`|`, `[`, `]`) and trims. */
export function sanitizeChipLabel(label: string): string {
  return label.replaceAll(/[|[\]]/g, "").trim()
}

/** Serializes a ref to its `[[kind:id|label]]` token (label sanitized). */
export function serializeChipToken(ref: ParticipantRef): string {
  return `[[${ref.kind}:${ref.id}|${sanitizeChipLabel(ref.label ?? "")}]]`
}

/** Serializes a ref to its `![[kind:id|label]]` embed token (label sanitized). */
export function serializeEmbedToken(ref: ParticipantRef): string {
  return `!${serializeChipToken(ref)}`
}

/**
 * Parses one exact embed token (`![[kind:id|label]]`) into a ref, or `null`
 * when the string isn't a valid embed token — mirroring {@link parseChipToken}.
 */
export function parseEmbedToken(token: string): ParticipantRef | null {
  if (!token.startsWith("!")) return null
  return parseChipToken(token.slice(1))
}

/**
 * Parses one exact token into a ref, or `null` when the string isn't a valid
 * token (unknown kind, empty id, malformed shape) — a non-token stays plain
 * text in the editor rather than becoming a broken chip.
 */
export function parseChipToken(token: string): ParticipantRef | null {
  const match = new RegExp(`^${CHIP_TOKEN_SOURCE}$`).exec(token)
  if (match === null) return null
  const [, kind, id, label] = match
  if (!KIND_SET.has(kind!) || id!.trim() === "") return null
  return { kind: kind as ParticipantKind, id: id!, label: label! }
}

/**
 * Extracts the distinct `(kind, id)` pairs from every chip token in a
 * markdown body — the mention-index feed (`campaignBeatMention` is re-derived
 * from this on every body autosave; D7).
 */
/**
 * Flattens chip and embed tokens to their captured labels — plain-text prose
 * for excerpt surfaces (the Day-End deadline alert) where a raw `[[…]]` or
 * `![[…]]` token would read as noise. Labels may be stale (the id is
 * authoritative), which an excerpt tolerates.
 */
export function stripChipTokens(markdown: string): string {
  return markdown.replaceAll(
    new RegExp(`!?${CHIP_TOKEN_SOURCE}`, "g"),
    (_match, _kind, _id, label: string) => label
  )
}

export function extractChipRefs(
  markdown: string
): Pick<ParticipantRef, "kind" | "id">[] {
  const refs: Pick<ParticipantRef, "kind" | "id">[] = []
  const seen = new Set<string>()
  for (const match of markdown.matchAll(new RegExp(CHIP_TOKEN_SOURCE, "g"))) {
    const [, kind, id] = match
    if (id!.trim() === "") continue
    const key = `${kind}:${id}`
    if (seen.has(key)) continue
    seen.add(key)
    refs.push({ kind: kind as ParticipantKind, id: id! })
  }
  return refs
}
