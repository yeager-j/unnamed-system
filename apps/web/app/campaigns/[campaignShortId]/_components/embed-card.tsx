"use client"

import Link from "next/link"

import { cn } from "@workspace/ui/lib/utils"

import { CombatantChip } from "@/components/combat/combatant-chip"
import { PARTICIPANT_KIND_ICONS } from "@/components/shared/participant-kind-icons"
import { useParticipantPreviewScope } from "@/components/shared/participant-preview"
import type { ParticipantKind } from "@/domain/planner/participant"
import {
  useParticipantPreview,
  type ParticipantPreviewState,
} from "@/domain/planner/use-participant-preview"

import { EMBED_CARD_ROUTES } from "./embed-kinds"

/**
 * The display path's embed block card (UNN-624) — what a whole-line
 * `![[kind:id|label]]` token renders in chip-prose. Data comes through the
 * same cached participant-preview pipeline the hover cards read; outside a
 * {@link useParticipantPreviewScope} (no DM planner context) it degrades to a
 * static card showing the captured label, never a broken fetch.
 */
export function EmbedCard({
  kind,
  id,
  label,
}: {
  kind: ParticipantKind
  id: string
  /** The token's captured label — the fallback identity while loading or on a miss. */
  label: string
}) {
  const scope = useParticipantPreviewScope()
  if (scope === null) {
    return <EmbedCardFrame kind={kind} name={label} meta={null} href={null} />
  }
  return <LoadedEmbedCard scope={scope} kind={kind} id={id} label={label} />
}

function LoadedEmbedCard({
  scope,
  kind,
  id,
  label,
}: {
  scope: NonNullable<ReturnType<typeof useParticipantPreviewScope>>
  kind: ParticipantKind
  id: string
  label: string
}) {
  const state = useParticipantPreview(scope.campaignId, kind, id, true)
  const route = EMBED_CARD_ROUTES[kind]
  const preview = state.status === "ready" ? state.preview : null
  const href =
    route && preview?.shortId
      ? route(scope.campaignShortId, preview.shortId)
      : null
  return (
    <EmbedCardFrame
      kind={kind}
      name={preview?.name ?? label}
      meta={metaOf(state)}
      href={href}
      missing={state.status === "missing"}
      enemies={preview?.enemies ?? null}
    />
  )
}

function metaOf(state: ParticipantPreviewState): string | null {
  switch (state.status) {
    case "loading":
      return "Loading…"
    case "missing":
      return "Not found"
    case "ready":
      return (
        [state.preview.sublabel, state.preview.detail]
          .filter((part) => part !== null)
          .join(" · ") || null
      )
  }
}

function EmbedCardFrame({
  kind,
  name,
  meta,
  href,
  missing = false,
  enemies = null,
}: {
  kind: ParticipantKind
  name: string
  meta: string | null
  href: string | null
  missing?: boolean
  /** Enemy-side combatant names, one chip each — the encounter card's "who you'll fight" row. */
  enemies?: string[] | null
}) {
  const Icon = PARTICIPANT_KIND_ICONS[kind]
  const body = (
    <>
      <Icon aria-hidden className="size-6 shrink-0 text-primary-text" />
      <span className="min-w-0">
        <span className="block truncate font-semibold text-foreground">
          {name}
        </span>
        {meta === null ? null : (
          <span className="block text-sm text-muted-foreground">{meta}</span>
        )}
        {enemies === null || enemies.length === 0 ? null : (
          <span className="mt-1.5 flex flex-wrap gap-1">
            {enemies.map((enemy, index) => (
              <CombatantChip
                key={`${enemy}-${index}`}
                side="enemies"
                label={enemy}
                className="border-border bg-destructive/10"
              />
            ))}
          </span>
        )}
      </span>
    </>
  )
  const frameClass = cn(
    "not-prose my-2 flex max-w-md items-center gap-3 rounded-lg border border-border bg-muted/40 px-3.5 py-2.5 no-underline",
    missing && "border-dotted opacity-60"
  )
  if (href === null) {
    return <span className={cn(frameClass, "cursor-default")}>{body}</span>
  }
  return (
    <Link
      href={href}
      className={cn(
        frameClass,
        "transition-colors hover:border-primary/40 hover:bg-muted/60"
      )}
      data-embed-card={`${kind}:${name}`}
    >
      {body}
    </Link>
  )
}
