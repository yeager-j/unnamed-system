"use client"

import Image from "next/image"

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
import type { CombatantDetail } from "@/lib/game/encounter"
import { initials } from "@/lib/ui/initials"
import { avatarSrc } from "@/lib/ui/portrait"

/**
 * The right-side **detail drawer** for a tapped combatant (UNN-345), a
 * {@link ResponsiveDialog} (desktop Sheet / mobile Drawer). It is a **container
 * only** — it dispatches nothing. Its write-owned sections (ACTIONS / VITALS /
 * AILMENT & CONDITIONS / POSITION) render as labeled placeholder slots that
 * their own tickets fill (each owns its Server Action, per the per-field
 * pattern); ATTRIBUTES + AFFINITIES are real read-only content, reusing the
 * shared grids. PC vitals edits will write the character row (DM-authorized,
 * UNN-297); enemy edits the session stat block — surfaced as the footer note.
 */
export function CombatantDrawer({
  detail,
  onClose,
}: {
  detail: CombatantDetail | null
  onClose: () => void
}) {
  return (
    <ResponsiveDialog
      open={detail !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {detail ? <DrawerBody detail={detail} /> : null}
    </ResponsiveDialog>
  )
}

function DrawerBody({ detail }: { detail: CombatantDetail }) {
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
        <SlotPlaceholder title="Actions this turn" ticket="UNN-312" />
        <SlotPlaceholder title="Vitals" ticket="UNN-309" />
        <SlotPlaceholder
          title="Ailment & conditions"
          ticket="UNN-310 / 294 / 311"
        />
        <SlotPlaceholder title="Position" ticket="UNN-315 / 316" />

        <DetailSection title="Attributes">
          <AttributeGrid attributes={detail.attributes} />
        </DetailSection>

        <DetailSection title="Affinities">
          {detail.affinities ? (
            <AffinityGrid
              chart={detail.affinities}
              columnsClassName="grid-cols-4"
            />
          ) : (
            <p className="text-sm text-muted-foreground">No affinity data.</p>
          )}
        </DetailSection>
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

/** A write-owned section the drawer only frames; its controls arrive with the
 *  named ticket (mirrors the setup shell's stub panels). */
function SlotPlaceholder({ title, ticket }: { title: string; ticket: string }) {
  return (
    <DetailSection title={title}>
      <p className="text-sm text-muted-foreground">
        Controls land in {ticket}.
      </p>
    </DetailSection>
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
  return [detail.level ? `Level ${detail.level}` : null, "Enemy"]
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
