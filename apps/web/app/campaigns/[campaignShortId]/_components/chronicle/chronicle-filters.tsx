"use client"

import {
  EyeIcon,
  EyeSlashIcon,
  FunnelIcon,
  UserFocusIcon,
  XIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useRouter } from "next/navigation"

import { Button } from "@workspace/ui/components/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@workspace/ui/components/dropdown-menu"

import { ACTIVITY_CATEGORY_LABELS } from "@/domain/labels"
import {
  UPDATE_CATEGORIES,
  type UpdateCategory,
} from "@/domain/planner/update-category"
import {
  chronicleSearchParams,
  type ChronicleParams,
} from "@/domain/planner/view/chronicle"
import type { LinkerOption } from "@/domain/planner/view/linker"
import { campaignChroniclePath } from "@/lib/paths"

import { ParticipantLinker } from "../world/participant-linker"

/**
 * The Chronicle's filter bar (FR-13): participant ("About:"), category, and
 * the Idle reveal — all URL state (`?about`/`?cat`/`?idle`), so filtered
 * views are shareable and the back button walks filter history. Changing a
 * filter re-renders the first page server-side; the feed resets with it.
 */
export function ChronicleFilters({
  campaignId,
  campaignShortId,
  params,
  participantLabel,
  linkerOptions,
}: {
  campaignId: string
  campaignShortId: string
  params: ChronicleParams
  /** The active `about` participant's display name; null when unfiltered. */
  participantLabel: string | null
  linkerOptions: LinkerOption[]
}) {
  const router = useRouter()

  const push = (next: ChronicleParams) =>
    router.push(
      `${campaignChroniclePath(campaignShortId)}${chronicleSearchParams(next)}`
    )
  const pushFilters = (filters: Partial<ChronicleParams["filters"]>) =>
    push({ ...params, filters: { ...params.filters, ...filters } })

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {/* Reserved: the Chronicle search slot (full-text search is a
          fast-follow — tech-design §8); the input mounts here. */}
      <ParticipantLinker
        campaignId={campaignId}
        options={linkerOptions}
        onPick={(ref) =>
          pushFilters({ participant: { kind: ref.kind, id: ref.id } })
        }
        trigger={
          <Button
            variant={
              params.filters.participant === null ? "ghost" : "secondary"
            }
            size="sm"
          >
            <UserFocusIcon />
            {participantLabel === null ? "About" : `About: ${participantLabel}`}
          </Button>
        }
      />
      {params.filters.participant !== null ? (
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Clear the participant filter"
          className="text-muted-foreground"
          onClick={() => pushFilters({ participant: null })}
        >
          <XIcon />
        </Button>
      ) : null}
      <CategoryFilter
        category={params.filters.category}
        onPick={(category) => pushFilters({ category })}
      />
      <Button
        variant={params.filters.showIdle ? "secondary" : "ghost"}
        size="sm"
        onClick={() => pushFilters({ showIdle: !params.filters.showIdle })}
      >
        {params.filters.showIdle ? <EyeIcon /> : <EyeSlashIcon />}
        Idle
      </Button>
    </div>
  )
}

function CategoryFilter({
  category,
  onPick,
}: {
  category: UpdateCategory | null
  onPick: (category: UpdateCategory | null) => void
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        render={
          <Button
            variant={category === null ? "ghost" : "secondary"}
            size="sm"
          />
        }
      >
        <FunnelIcon />
        {category === null ? "Category" : ACTIVITY_CATEGORY_LABELS[category]}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {UPDATE_CATEGORIES.map((key) => (
          <DropdownMenuItem key={key} onClick={() => onPick(key)}>
            {ACTIVITY_CATEGORY_LABELS[key]}
          </DropdownMenuItem>
        ))}
        {category !== null ? (
          <DropdownMenuItem onClick={() => onPick(null)}>
            <XIcon className="size-4" />
            All categories
          </DropdownMenuItem>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
