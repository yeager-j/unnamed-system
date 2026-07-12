"use client"

import {
  CalendarBlankIcon,
  ClockCounterClockwiseIcon,
  GearSixIcon,
  MaskHappyIcon,
  NotebookIcon,
  PlayCircleIcon,
  ScrollIcon,
} from "@phosphor-icons/react/dist/ssr"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { useSyncExternalStore } from "react"

import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { Sparkle } from "@/components/shared/celestial"
import {
  campaignArticlesPath,
  campaignCalendarPath,
  campaignChroniclePath,
  campaignManagePath,
  campaignNotesPath,
  campaignNpcsPath,
  campaignPath,
} from "@/lib/paths"

const emptySubscribe = () => () => {}

/**
 * The planner's icon rail (handoff "Navigation frame"): a standalone 56px
 * column — campaign-level nav (Day Runner, Session Notes, NPCs, Articles,
 * Calendar, Chronicle) with Manage Campaign's gear pinned at the bottom.
 * Deliberately **not** a shadcn `Sidebar`: it never collapses, never sheets,
 * and pages own their actual sidebars (the Day Runner's roster, the Notes
 * tree), so the rail is a plain composite the handoff itself styles custom.
 */
export function PlannerRail({ campaignShortId }: { campaignShortId: string }) {
  const pathname = usePathname()
  const rootPath = campaignPath(campaignShortId)

  // Tooltips attach only after hydration: an SSR'd Base UI tooltip trigger
  // writes an eager server id the client render computes differently, and the
  // mismatch cascades through the subtree. Server and hydration render are
  // tooltip-free and byte-identical; the styled tooltip upgrades in the
  // post-hydration pass `useSyncExternalStore` schedules.
  const hydrated = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  )

  const items = [
    {
      label: "Day Runner",
      href: rootPath,
      icon: PlayCircleIcon,
      active: pathname === rootPath,
    },
    {
      label: "Session Notes",
      href: campaignNotesPath(campaignShortId),
      icon: NotebookIcon,
      active: pathname.startsWith(campaignNotesPath(campaignShortId)),
    },
    {
      label: "NPCs",
      href: campaignNpcsPath(campaignShortId),
      icon: MaskHappyIcon,
      active: pathname.startsWith(campaignNpcsPath(campaignShortId)),
    },
    {
      label: "Articles",
      href: campaignArticlesPath(campaignShortId),
      icon: ScrollIcon,
      active: pathname.startsWith(campaignArticlesPath(campaignShortId)),
    },
    {
      label: "Calendar",
      href: campaignCalendarPath(campaignShortId),
      icon: CalendarBlankIcon,
      active: pathname.startsWith(campaignCalendarPath(campaignShortId)),
    },
    {
      label: "Chronicle",
      href: campaignChroniclePath(campaignShortId),
      icon: ClockCounterClockwiseIcon,
      active: pathname.startsWith(campaignChroniclePath(campaignShortId)),
    },
  ]

  return (
    <nav
      aria-label="Campaign planner"
      className="sticky top-14 flex h-[calc(100svh-3.5rem)] w-14 shrink-0 flex-col items-center gap-1 border-r bg-sidebar py-3"
    >
      <Link
        href={rootPath}
        aria-label="Campaign home"
        className="mb-2 flex size-9 items-center justify-center rounded-lg bg-primary text-primary-foreground"
      >
        <Sparkle className="size-4" />
      </Link>
      {items.map((item) => (
        <RailButton key={item.label} hydrated={hydrated} {...item} />
      ))}
      <div className="flex-1" />
      <RailButton
        hydrated={hydrated}
        label="Manage Campaign"
        href={campaignManagePath(campaignShortId)}
        icon={GearSixIcon}
        active={pathname.startsWith(campaignManagePath(campaignShortId))}
      />
    </nav>
  )
}

function RailButton({
  label,
  href,
  icon: Icon,
  active,
  hydrated,
}: {
  label: string
  href: string
  icon: React.ComponentType<{ className?: string }>
  active: boolean
  hydrated: boolean
}) {
  const button = (
    <Button
      variant="ghost"
      size="icon"
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={cn(
        "text-muted-foreground",
        active && "border border-primary/40 bg-primary/15 text-primary-text"
      )}
      render={<Link href={href} />}
      nativeButton={false}
    >
      <Icon className="size-5" />
    </Button>
  )

  if (!hydrated) return button
  return (
    <Tooltip>
      <TooltipTrigger render={button} />
      <TooltipContent side="right">{label}</TooltipContent>
    </Tooltip>
  )
}
