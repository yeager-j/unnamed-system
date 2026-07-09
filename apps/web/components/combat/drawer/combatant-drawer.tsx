"use client"

import Image from "next/image"

import type {
  ActionEconomyEvent,
  AilmentEvent,
  BattleConditionEvent,
  CounterEvent,
} from "@workspace/game-v2/encounter"
import type { MapInstanceEvent } from "@workspace/game-v2/spatial"
import { getTalent } from "@workspace/game-v2/talents"
import { Badge } from "@workspace/ui/components/badge"
import { ItemGroup } from "@workspace/ui/components/item"
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@workspace/ui/components/responsive-dialog"
import { useLastPresent } from "@workspace/ui/hooks/use-last-present"
import { cn } from "@workspace/ui/lib/utils"

import type { DispatchCombatantWrite } from "@/components/combat/console/use-combatant-write"
import { CombatantActionsSection } from "@/components/combat/drawer/actions-section"
import { CombatantConditionsSection } from "@/components/combat/drawer/conditions-section"
import { CombatantCountersSection } from "@/components/combat/drawer/counters-section"
import { CombatantEngagementSection } from "@/components/combat/drawer/engagement-section"
import { CombatantPositionSection } from "@/components/combat/drawer/position-section"
import { CombatantVitalsSection } from "@/components/combat/drawer/vitals-section"
import { AffinityGrid } from "@/components/shared/affinity-grid"
import { AttributeGrid } from "@/components/shared/attribute-grid"
import { DetailSection } from "@/components/shared/detail-section"
import { ResolvedSkillRow } from "@/components/shared/resolved-skill-row"
import type { CombatantDetail } from "@/lib/combat/view/detail-view"
import { initials } from "@/lib/ui/initials"
import { avatarSrc } from "@/lib/ui/portrait"

/** Every event the drawer's editable sections can emit — overlay edits plus
 *  the spatial position/engagement events. The console's dispatch (a superset
 *  handler) satisfies it contravariantly. */
export type DrawerEvent =
  | ActionEconomyEvent
  | AilmentEvent
  | BattleConditionEvent
  | CounterEvent
  | MapInstanceEvent

/**
 * The right-side **detail drawer** for a tapped combatant (UNN-345), on v2
 * (UNN-535). The editable sections dispatch through two channels: overlay /
 * spatial edits as v2 events through `onCombatEvent`, and **vitals** as
 * storage-blind write descriptors through `dispatchWrite` (the CD19 router —
 * durable PC HP/SP is writable again, superseding UNN-482).
 *
 * The read-only stat sections render **by capability**: Attributes /
 * Affinities / Skills appear iff their read-unit resolved — no PC-vs-enemy fork
 * decides the layout. Skills in particular come off the resolved participant
 * view uniformly for every combatant (UNN-551 removed the durable storage fork).
 */
export function CombatantDrawer({
  detail,
  onClose,
  onCombatEvent,
  dispatchWrite,
}: {
  detail: CombatantDetail | null
  onClose: () => void
  onCombatEvent: (event: DrawerEvent) => void
  dispatchWrite: DispatchCombatantWrite
}) {
  const shown = useLastPresent(detail)
  return (
    <ResponsiveDialog
      open={detail !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {shown ? (
        <DrawerBody
          detail={shown}
          onCombatEvent={onCombatEvent}
          dispatchWrite={dispatchWrite}
        />
      ) : null}
    </ResponsiveDialog>
  )
}

function DrawerBody({
  detail,
  onCombatEvent,
  dispatchWrite,
}: {
  detail: CombatantDetail
  onCombatEvent: (event: DrawerEvent) => void
  dispatchWrite: DispatchCombatantWrite
}) {
  return (
    <ResponsiveDialogContent className="data-[side=right]:sm:max-w-md">
      <ResponsiveDialogHeader className="flex-row items-center gap-3 space-y-0">
        <HeaderAvatar detail={detail} />
        <div className="flex min-w-0 flex-col">
          <ResponsiveDialogTitle className="truncate">
            {detail.name}
          </ResponsiveDialogTitle>
          <ResponsiveDialogDescription>
            {subtitle(detail)}
          </ResponsiveDialogDescription>
        </div>
      </ResponsiveDialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
        <CombatantActionsSection
          detail={detail}
          onCombatEvent={onCombatEvent}
        />
        <CombatantVitalsSection detail={detail} dispatchWrite={dispatchWrite} />
        <CombatantConditionsSection
          detail={detail}
          onCombatEvent={onCombatEvent}
        />
        <CombatantCountersSection
          detail={detail}
          onCombatEvent={onCombatEvent}
        />
        <CombatantPositionSection
          detail={detail}
          onCombatEvent={onCombatEvent}
        />
        <CombatantEngagementSection
          detail={detail}
          onCombatEvent={onCombatEvent}
        />

        {detail.attributes ? (
          <DetailSection title="Attributes">
            <AttributeGrid attributes={detail.attributes} />
          </DetailSection>
        ) : null}

        {detail.affinities ? (
          <DetailSection title="Affinities">
            <AffinityGrid
              chart={detail.affinities}
              columnsClassName="grid-cols-4"
            />
          </DetailSection>
        ) : null}

        {detail.talentKeys !== null ? (
          <DetailSection title="Talents">
            {detail.talentKeys.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {detail.talentKeys.map((key) => (
                  <Badge key={key} variant="outline">
                    {getTalent(key)?.name ?? key}
                  </Badge>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">No talents.</p>
            )}
          </DetailSection>
        ) : null}

        <SkillsSection detail={detail} />
      </div>

      <ResponsiveDialogFooter className="border-t">
        <p className="text-xs text-muted-foreground">
          {detail.isPc
            ? `HP/SP changes here write ${detail.name}'s character sheet; conditions apply to this encounter.`
            : "Edits affect this enemy in this encounter only."}
        </p>
      </ResponsiveDialogFooter>
    </ResponsiveDialogContent>
  )
}

/**
 * Skills render **uniformly** off the resolved participant view for every
 * combatant — durable PC or inline enemy (UNN-551). The old rich-vs-lean storage
 * fork (a durable PC's party-scaled v1 `HydratedSkill` cards vs an inline
 * combatant's lean list) is gone: an entity PC has no v1 row to hydrate, and its
 * `skills` are decided at the drawer-model boundary: party-scaled sheet Skills
 * for PCs and session-resolved Skills for inline combatants. Every list renders
 * through the shared resolved-Skill row and banner-card popover.
 */
function SkillsSection({ detail }: { detail: CombatantDetail }) {
  if (detail.skills.length === 0) return null
  return (
    <DetailSection title="Skills">
      <ItemGroup className="gap-0">
        {detail.skills.map((resolved) => (
          <ResolvedSkillRow
            key={resolved.skill.key}
            resolved={resolved}
            attributes={detail.attributes ?? ZERO_ATTRIBUTES}
            showCost={detail.hasSkillPool}
          />
        ))}
      </ItemGroup>
    </DetailSection>
  )
}

/** `Level N · Class · pronouns` (each part present iff known). */
function subtitle(detail: CombatantDetail): string {
  return [
    detail.level !== null ? `Level ${detail.level}` : null,
    detail.className ?? (detail.isPc ? null : "Enemy"),
    detail.pronouns,
  ]
    .filter(Boolean)
    .join(" · ")
}

const ZERO_ATTRIBUTES = {
  strength: 0,
  magic: 0,
  agility: 0,
  luck: 0,
} as const

function HeaderAvatar({ detail }: { detail: CombatantDetail }) {
  if (detail.isPc) {
    return (
      <Image
        src={avatarSrc(detail.portraitUrl, detail.name || detail.id)}
        alt=""
        width={40}
        height={40}
        className="size-10 shrink-0 rounded-none object-cover"
      />
    )
  }
  return (
    <span
      aria-hidden
      className={cn(
        "flex size-10 shrink-0 items-center justify-center rounded-none text-xs font-semibold",
        detail.side === "players"
          ? "bg-primary/10 text-primary"
          : "bg-destructive/10 text-destructive"
      )}
    >
      {initials(detail.name)}
    </span>
  )
}
