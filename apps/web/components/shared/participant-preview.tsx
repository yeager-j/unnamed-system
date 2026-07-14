"use client"

import { createContext, useContext, useState, type ReactNode } from "react"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"

import { ParticipantPill } from "@/components/shared/participant-pill"
import { ParticipantPreviewCard } from "@/components/shared/participant-preview-card"
import type { ParticipantKind } from "@/domain/planner/participant"
import { useParticipantPreview } from "@/domain/planner/use-participant-preview"

/** How long a pointer must rest on a pill before its card opens — and therefore fetches. */
const HOVER_DELAY_MS = 300

const CampaignContext = createContext<string | null>(null)

/**
 * Puts the hovering campaign in scope for every pill under it (UNN-622). The
 * planner layout mounts one, inside its DM branch — so a pill's card is gated
 * by the same DM check its data is, and pills rendered anywhere else (a future
 * player-facing surface) simply have no preview rather than a broken fetch.
 */
export function ParticipantPreviewProvider({
  campaignId,
  children,
}: {
  campaignId: string
  children: ReactNode
}) {
  return (
    <CampaignContext.Provider value={campaignId}>
      {children}
    </CampaignContext.Provider>
  )
}

/**
 * A participant pill that previews its subject on hover — the display path's
 * half of UNN-622, sharing {@link ParticipantPreviewCard} with the editor's
 * CM6 hover bridge. Every chip surface (prose bodies, beat-card chip rows,
 * timeline lines, relation rows) renders this rather than the bare pill.
 *
 * With no {@link ParticipantPreviewProvider} in scope it degrades to exactly
 * the plain pill. The card's open delay is the fetch's debounce: a pointer
 * sweeping across a line of chips fetches none of them.
 */
export function ParticipantPreviewPill({
  kind,
  id,
  label,
  tombstoned = false,
  className,
}: {
  kind: ParticipantKind
  id: string
  label: string
  tombstoned?: boolean
  className?: string
}) {
  const campaignId = useContext(CampaignContext)
  if (campaignId === null) {
    return (
      <ParticipantPill
        kind={kind}
        label={label}
        tombstoned={tombstoned}
        className={className}
      />
    )
  }
  return (
    <PreviewingPill
      campaignId={campaignId}
      kind={kind}
      id={id}
      label={label}
      tombstoned={tombstoned}
      className={className}
    />
  )
}

function PreviewingPill({
  campaignId,
  kind,
  id,
  label,
  tombstoned,
  className,
}: {
  campaignId: string
  kind: ParticipantKind
  id: string
  label: string
  tombstoned: boolean
  className?: string
}) {
  const [open, setOpen] = useState(false)
  const state = useParticipantPreview(campaignId, kind, id, open)

  return (
    <HoverCard open={open} onOpenChange={setOpen}>
      <HoverCardTrigger
        delay={HOVER_DELAY_MS}
        render={
          <ParticipantPill
            kind={kind}
            label={label}
            tombstoned={tombstoned}
            className={className}
            data-participant-preview-trigger={`${kind}:${id}`}
          />
        }
      />
      <HoverCardContent side="top" data-participant-preview-card="">
        <ParticipantPreviewCard
          kind={kind}
          label={label}
          tombstoned={tombstoned}
          state={state}
        />
      </HoverCardContent>
    </HoverCard>
  )
}
