import type {
  CharacterChainRow,
  CharacterKnifeRow,
} from "@/lib/db/queries/load-character"
import type { IdentityTraitField } from "@/lib/db/writes/identity-traits"

import {
  IDENTITY_TRAIT_MESSAGES,
  IDENTITY_TRAIT_ORDER,
} from "./identity-trait-messages"

/**
 * The Movement 3 writer's left rail is a flat list of "documents" grouped
 * by kind. A `DocumentRef` is one row in the sidebar — an identifier the
 * sidebar renders and the writer pane resolves back to its persisted text
 * via {@link resolveDocumentContent}.
 *
 * Each ref carries its display label at construction time so the sidebar
 * component never case-splits on `kind` for labeling. The discriminator is
 * present so the pane can dispatch to the matching Server Action (Knife
 * title-update, Identity Trait update, …) without ambiguity.
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
 * Builds the sidebar's grouped document list from the loaded builder
 * character. Order matches the rulebook's Movement 3 flow: long-form
 * Backstory first, then the stakes (Knives), the limitations (Chains),
 * and finally the Identity Traits that build on top of them.
 */
export function buildDocumentGroups({
  knives,
  chains,
}: {
  knives: readonly CharacterKnifeRow[]
  chains: readonly CharacterChainRow[]
}): DocumentGroup[] {
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
      entries: knives.map(
        (k): DocumentRef => ({ kind: "knife", id: k.id, label: k.title })
      ),
      canAdd: true,
      canRemove: true,
    },
    {
      kind: "chains",
      label: "Chains",
      entries: chains.map(
        (c): DocumentRef => ({ kind: "chain", id: c.id, label: c.title })
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
 * Resolves a `DocumentRef` against the loaded character to the per-document
 * content the writer pane renders. Returns `null` if the ref no longer
 * matches an entry (e.g. the Knife was just removed) — the caller falls
 * back to {@link DEFAULT_DOCUMENT_REF}.
 */
export interface ResolvedDocument {
  ref: DocumentRef
  /** Empty string for unset Backstory / Identity Trait columns. */
  body: string
  /** Present for Knife / Chain refs whose title is player-editable. */
  title: string | null
}

export function resolveDocumentContent(
  ref: DocumentRef,
  source: {
    backstoryText: string | null
    knives: readonly CharacterKnifeRow[]
    chains: readonly CharacterChainRow[]
    personalityTraits: string | null
    hopes: string | null
    dreams: string | null
    fears: string | null
    secrets: string | null
  }
): ResolvedDocument | null {
  switch (ref.kind) {
    case "backstory":
      return { ref, body: source.backstoryText ?? "", title: null }
    case "knife": {
      const knife = source.knives.find((k) => k.id === ref.id)
      if (!knife) return null
      return { ref, body: knife.description ?? "", title: knife.title }
    }
    case "chain": {
      const chain = source.chains.find((c) => c.id === ref.id)
      if (!chain) return null
      return { ref, body: chain.description ?? "", title: chain.title }
    }
    case "identity": {
      const column = identityColumnFor(ref.id)
      return { ref, body: source[column] ?? "", title: null }
    }
  }
}

const IDENTITY_COLUMN_FOR_FIELD = {
  personality: "personalityTraits",
  hope: "hopes",
  dream: "dreams",
  fear: "fears",
  secret: "secrets",
} as const satisfies Record<
  IdentityTraitField,
  "personalityTraits" | "hopes" | "dreams" | "fears" | "secrets"
>

function identityColumnFor(field: IdentityTraitField) {
  return IDENTITY_COLUMN_FOR_FIELD[field]
}

/** Comparator helpers for context selection equality. */
export function refsEqual(a: DocumentRef, b: DocumentRef): boolean {
  return a.kind === b.kind && a.id === b.id
}
