"use client"

import Image from "next/image"

import { type CombatantDetail } from "@workspace/game/engine"
import { type CombatEvent } from "@workspace/game/foundation"
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@workspace/ui/components/responsive-dialog"
import { cn } from "@workspace/ui/lib/utils"

import { AffinityGrid } from "@/components/shared/affinity-grid"
import { AttributeGrid } from "@/components/shared/attribute-grid"
import { DetailSection } from "@/components/shared/detail-section"
import { initials } from "@/lib/ui/initials"
import { avatarSrc } from "@/lib/ui/portrait"

import { CombatantActionsSection } from "./combatant-actions-section"
import { CombatantConditionsSection } from "./combatant-conditions-section"
import { CombatantCountersSection } from "./combatant-counters-section"
import { CombatantEngagementSection } from "./combatant-engagement-section"
import { CombatantPositionSection } from "./combatant-position-section"
import { CombatantVitalsSection } from "./combatant-vitals-section"
import { EnemyStatblock } from "./enemy-statblock"

/**
 * The right-side **detail drawer** for a tapped combatant (UNN-345), a
 * {@link ResponsiveDialog} (desktop Sheet / mobile Drawer). The editable sections
 * all dispatch a `CombatEvent` through `onCombatEvent`: **VITALS** (UNN-309; PC
 * HP/SP route through the pools actions inside the section, enemy HP through the
 * `adjustEnemyVitals` event), **ACTIONS THIS TURN** and **AILMENT & CONDITIONS**
 * (UNN-310), **POSITION** (UNN-315; the move-between-zones control via the
 * `moveCombatant` event), and **ENGAGEMENT** (UNN-316; set/clear via the
 * `setEngagement`/`clearEngagement` events). ATTRIBUTES + AFFINITIES are
 * read-only (shared grids); a catalog enemy additionally shows read-only SKILLS
 * (each a shared {@link SkillRow}, hydrated against the enemy's flat Attributes
 * so the Attack Roll readout matches a character's, with the cost row dropped —
 * enemies pay no Skill costs) and its freeform ABILITIES Markdown.
 */
export function CombatantDrawer({
  detail,
  onClose,
  onCombatEvent,
}: {
  detail: CombatantDetail | null
  onClose: () => void
  onCombatEvent: (event: CombatEvent) => void
}) {
  return (
    <ResponsiveDialog
      open={detail !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {detail ? (
        <DrawerBody detail={detail} onCombatEvent={onCombatEvent} />
      ) : null}
    </ResponsiveDialog>
  )
}

function DrawerBody({
  detail,
  onCombatEvent,
}: {
  detail: CombatantDetail
  onCombatEvent: (event: CombatEvent) => void
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
        <CombatantVitalsSection detail={detail} onCombatEvent={onCombatEvent} />
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

        {detail.kind === "pc" ? (
          <>
            <DetailSection title="Attributes">
              <AttributeGrid attributes={detail.attributes} />
            </DetailSection>

            <DetailSection title="Affinities">
              <AffinityGrid
                chart={detail.affinities}
                columnsClassName="grid-cols-4"
              />
            </DetailSection>
          </>
        ) : (
          <EnemyStatblock statblock={detail.statblock} />
        )}
      </div>

      <ResponsiveDialogFooter className="border-t">
        <p className="text-xs text-muted-foreground">
          {detail.kind === "pc"
            ? `Edits write straight to ${detail.name}'s character sheet — the player sees it live.`
            : "Edits affect this enemy in this encounter only."}
        </p>
      </ResponsiveDialogFooter>
    </ResponsiveDialogContent>
  )
}

/** `Level N · Class · pronouns` for a PC; `Level N · Enemy` (level optional)
 *  for an enemy. */
function subtitle(detail: CombatantDetail): string {
  if (detail.kind === "pc") {
    return [`Level ${detail.level}`, detail.className, detail.pronouns]
      .filter(Boolean)
      .join(" · ")
  }
  return [
    detail.statblock.level ? `Level ${detail.statblock.level}` : null,
    "Enemy",
  ]
    .filter(Boolean)
    .join(" · ")
}

function HeaderAvatar({ detail }: { detail: CombatantDetail }) {
  if (detail.kind === "pc") {
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
