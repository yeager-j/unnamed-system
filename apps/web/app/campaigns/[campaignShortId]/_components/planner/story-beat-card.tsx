import { CheckCircleIcon, NotebookIcon } from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { PARTICIPANT_KIND_ICONS } from "@/components/shared/participant-kind-icons"
import type { ResolvedParticipant } from "@/domain/planner/participant"
import type { RunnerBeatView } from "@/domain/planner/view/runner"
import { campaignNotesPath } from "@/lib/paths"

/**
 * The runner's **story slot card**, phase-3 scope (handoff Screen 1's
 * `.beatcard`, read-only): kicker, title, tagline, the beat's participant
 * chips, and "Open notes" as the one live affordance. Defer / Mark resolved /
 * the inline collapsible body arrive with phase 4's write flows — this card
 * pulls no phase-4 behavior forward, it just keeps a freshly scheduled beat
 * from stranding the DM on a dead surface.
 */
export function StoryBeatCard({
  campaignShortId,
  beat,
  participants,
}: {
  campaignShortId: string
  beat: RunnerBeatView
  participants: ResolvedParticipant[]
}) {
  return (
    <div className="mx-auto w-full max-w-2xl rounded-[calc(var(--radius)+4px)] border bg-card p-6">
      <div className="flex items-center gap-2">
        <span className="font-mono text-[10px] tracking-wider text-muted-foreground uppercase">
          Story beat
        </span>
        {beat.resolved ? (
          <Badge variant="outline" className="gap-1 text-xs">
            <CheckCircleIcon className="size-3.5 text-primary-text" />
            Scene resolved
          </Badge>
        ) : null}
      </div>
      <h2 className="mt-2 font-display text-2xl text-foreground">
        {beat.title}
      </h2>
      {beat.tagline.trim() === "" ? null : (
        <p className="mt-2 text-base text-muted-foreground">{beat.tagline}</p>
      )}
      {participants.length > 0 ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {participants.map((participant) => {
            const Icon = PARTICIPANT_KIND_ICONS[participant.ref.kind]
            return (
              <span
                key={`${participant.ref.kind}:${participant.ref.id}`}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium",
                  participant.ref.kind === "npc"
                    ? "bg-primary/16 text-primary-text"
                    : "bg-muted/55 text-foreground",
                  participant.tombstoned && "opacity-50"
                )}
              >
                <Icon aria-hidden className="size-3.5 shrink-0" />
                {participant.label}
              </span>
            )
          })}
        </div>
      ) : null}
      <div className="mt-5 border-t pt-4">
        <Button
          variant="outline"
          render={
            <Link
              href={`${campaignNotesPath(campaignShortId)}?beat=${beat.id}`}
            />
          }
          nativeButton={false}
        >
          <NotebookIcon />
          Open notes
        </Button>
      </div>
    </div>
  )
}
