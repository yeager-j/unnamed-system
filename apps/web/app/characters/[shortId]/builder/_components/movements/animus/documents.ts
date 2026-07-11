import type { Narrative } from "@workspace/game-v2/narrative"

import {
  IDENTITY_TRAIT_MESSAGES,
  IDENTITY_TRAIT_ORDER,
  type IdentityTraitField,
} from "@/domain/character/identity-trait-messages"

/**
 * The Movement 3 writer's left rail is a flat list of "documents" grouped
 * by kind. A `DocumentRef` is one row in the sidebar — an identifier the
 * sidebar renders and the writer pane resolves back to its persisted text
 * via {@link resolveDocumentContent}.
 *
 * Knives and Chains address their entry by **array index** (stringified):
 * v2's `narrative` component stores them as ordered `IdentityBeat` lists
 * with no row ids — display order IS the array order (D36) — and the
 * per-entry write descriptors address the same index.
 *
 * Each ref carries its display label at construction time so the sidebar
 * component never case-splits on `kind` for labeling. The discriminator is
 * present so the pane can build the matching write descriptor (Knife
 * title-edit, Identity Trait update, …) without ambiguity.
 */
export type DocumentRef =
  | { kind: "backstory"; id: "backstory"; label: "Backstory" }
  | { kind: "knife"; id: string; label: string }
  | { kind: "chain"; id: string; label: string }
  | { kind: "identity"; id: IdentityTraitField; label: string }

/**
 * A sidebar group is the unit between a heading and its rows. Backstory is
 * a single row (no group label is rendered as a heading badge); Knives /
 * Chains are repeating with an Add affordance; Identity Traits are five
 * fixed rows.
 */
export type DocumentGroupKind = "backstory" | "knives" | "chains" | "identity"

export interface DocumentGroup {
  kind: DocumentGroupKind
  label: string
  entries: DocumentRef[]
  /** Whether the sidebar should render an Add button for this group. */
  canAdd: boolean
  /** Whether each entry should expose a remove affordance on hover. */
  canRemove: boolean
}

const BACKSTORY_REF: DocumentRef = {
  kind: "backstory",
  id: "backstory",
  label: "Backstory",
}

/**
 * Single source for the empty-title label across both the sidebar row and the
 * editor's title `placeholder`. Notion-style "Untitled X" — visually muted in
 * the sidebar cues that the row needs a name; the same string as the editor
 * placeholder keeps the player's mental model consistent across surfaces.
 */
export const UNTITLED_KNIFE = "Untitled Knife"
export const UNTITLED_CHAIN = "Untitled Chain"

/**
 * Builds the sidebar's grouped document list from the draft's narrative
 * component. Order matches the rulebook's Movement 3 flow: long-form
 * Backstory first, then the stakes (Knives), the limitations (Chains),
 * and finally the Identity Traits that build on top of them.
 */
export function buildDocumentGroups(
  narrative: Narrative | undefined
): DocumentGroup[] {
  return [
    {
      kind: "backstory",
      label: "Backstory",
      entries: [BACKSTORY_REF],
      canAdd: false,
      canRemove: false,
    },
    {
      kind: "knives",
      label: "Knives",
      entries: (narrative?.knives ?? []).map(
        (knife, index): DocumentRef => ({
          kind: "knife",
          id: String(index),
          label: knife.title,
        })
      ),
      canAdd: true,
      canRemove: true,
    },
    {
      kind: "chains",
      label: "Chains",
      entries: (narrative?.chains ?? []).map(
        (chain, index): DocumentRef => ({
          kind: "chain",
          id: String(index),
          label: chain.title,
        })
      ),
      canAdd: true,
      canRemove: true,
    },
    {
      kind: "identity",
      label: "Identity Traits",
      entries: IDENTITY_TRAIT_ORDER.map(
        (field): DocumentRef => ({
          kind: "identity",
          id: field,
          label: IDENTITY_TRAIT_MESSAGES[field].label,
        })
      ),
      canAdd: false,
      canRemove: false,
    },
  ]
}

/** The default selection on first mount of the writer. */
export const DEFAULT_DOCUMENT_REF: DocumentRef = BACKSTORY_REF

/**
 * Resolves a `DocumentRef` against the draft's narrative component to the
 * per-document content the writer pane renders. Returns `null` if the ref no
 * longer matches an entry (e.g. the Knife was just removed) — the caller
 * falls back to {@link DEFAULT_DOCUMENT_REF}.
 */
export interface ResolvedDocument {
  ref: DocumentRef
  /** Empty string for unset Backstory / Identity Trait fields. */
  body: string
  /** Present for Knife / Chain refs whose title is player-editable. */
  title: string | null
}

export function resolveDocumentContent(
  ref: DocumentRef,
  narrative: Narrative | undefined
): ResolvedDocument | null {
  switch (ref.kind) {
    case "backstory":
      return { ref, body: narrative?.backstory ?? "", title: null }
    case "knife": {
      const knife = narrative?.knives[Number(ref.id)]
      if (!knife) return null
      return { ref, body: knife.description ?? "", title: knife.title }
    }
    case "chain": {
      const chain = narrative?.chains[Number(ref.id)]
      if (!chain) return null
      return { ref, body: chain.description ?? "", title: chain.title }
    }
    case "identity":
      return { ref, body: narrative?.[ref.id] ?? "", title: null }
  }
}

/** Comparator helpers for context selection equality. */
export function refsEqual(a: DocumentRef, b: DocumentRef): boolean {
  return a.kind === b.kind && a.id === b.id
}
