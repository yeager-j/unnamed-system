"use client"

import { LockSimpleIcon } from "@phosphor-icons/react"
import { useRef } from "react"

import { MASTERY_RANK } from "@workspace/game-v2/archetypes/archetype"
import { type AtlasNode } from "@workspace/game-v2/archetypes/atlas"
import {
  LINEAGE_SUGGESTED_PATH,
  type AttributeScores,
  type PathChoice,
} from "@workspace/game-v2/kernel/vocab"
import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { ItemGroup } from "@workspace/ui/components/item"
import {
  ResponsiveDialog,
  ResponsiveDialogContent,
  ResponsiveDialogDescription,
  ResponsiveDialogFooter,
  ResponsiveDialogHeader,
  ResponsiveDialogTitle,
} from "@workspace/ui/components/responsive-dialog"
import { Separator } from "@workspace/ui/components/separator"
import { useLastPresent } from "@workspace/ui/hooks/use-last-present"

import { ArchetypeAffinitiesChart } from "@/components/archetype/archetype-affinities-chart"
import { ArchetypeAttributesGrid } from "@/components/archetype/archetype-attributes-grid"
import { ArchetypeDetailHeader } from "@/components/archetype/archetype-detail-header"
import { ArchetypeMechanicProse } from "@/components/archetype/archetype-mechanic-prose"
import { ArchetypeResolvedSkills } from "@/components/archetype/archetype-resolved-skills"
import { ArchetypeTalents } from "@/components/archetype/archetype-talents"
import { formatMasteryDescription } from "@/components/archetype/format"
import { DetailSection } from "@/components/shared/detail-section"
import { ResolvedSkillRow } from "@/components/shared/resolved-skill-row"
import { OwnerOnly } from "@/components/shell/viewer-role"
import { buildSkillCardView } from "@/domain/combat/view/skill-card-view"
import {
  getArchetype,
  resolveCreationArchetypeSkills,
} from "@/domain/game-engine-v2"
import { SUGGESTED_PATH_LABELS } from "@/lib/ui/labels"

import { ArchetypeActionButton } from "./archetype-action-button"

/**
 * The detail panel for a selected Archetype (UNN-239). Reuses the shared
 * `components/archetype/` kit for the heavy sections (attributes, affinities,
 * skills-by-rank, talents, mechanic flavor) and adds the Atlas-only framing:
 * prerequisites with met/unmet state, Mastery, Recommended Path,
 * Inheritance-Slot count, and the action footer.
 *
 * Rendered as a {@link ResponsiveDialog} — a bottom Drawer on mobile, a
 * right-side Sheet (capped at `sm:max-w-2xl`) on desktop. Dismisses via the
 * footer Close, Esc, an outside click, or (mobile) a swipe down.
 *
 * Skills are resolved via the catalog preview so an *unowned* Archetype still
 * shows its full Rank-keyed list with costs — this is a planning view, not the
 * live combat readout; `currentRank` (the owned Rank, or 0) drives which ranks
 * read as unlocked.
 */
export function ArchetypeDetailPanel({
  node,
  savedRanks,
  attributes,
  pathChoice,
  onClose,
}: {
  node: AtlasNode | null
  savedRanks: number
  attributes: AttributeScores
  pathChoice: PathChoice
  onClose: () => void
}) {
  const shown = useLastPresent(node)
  return (
    <ResponsiveDialog
      open={node !== null}
      onOpenChange={(open) => !open && onClose()}
    >
      {shown ? (
        <PanelBody
          node={shown}
          savedRanks={savedRanks}
          attributes={attributes}
          pathChoice={pathChoice}
          onClose={onClose}
        />
      ) : null}
    </ResponsiveDialog>
  )
}

function PanelBody({
  node,
  savedRanks,
  attributes,
  pathChoice,
  onClose,
}: {
  node: AtlasNode
  savedRanks: number
  attributes: AttributeScores
  pathChoice: PathChoice
  onClose: () => void
}) {
  const { archetype, state } = node
  const locked = state.kind === "locked"
  const ownedRank =
    state.kind === "owned" || state.kind === "mastered" ? state.rank : 0
  const { ranks, synthesis } = resolveCreationArchetypeSkills(
    archetype,
    pathChoice
  )
  const suggestedPath = LINEAGE_SUGGESTED_PATH[archetype.lineage]
  // Focus the header on open rather than letting the dialog auto-focus the
  // first tabbable element — which, for an Archetype with no unlocked (hence
  // no interactive) Skill rows, is the footer action button, scrolling the
  // panel to the bottom on open.
  const headerRef = useRef<HTMLDivElement>(null)

  return (
    <ResponsiveDialogContent
      initialFocusRef={headerRef}
      className="data-[side=right]:sm:max-w-2xl"
    >
      <ResponsiveDialogHeader ref={headerRef}>
        <ArchetypeDetailHeader
          archetype={archetype}
          titleAs={ResponsiveDialogTitle}
          subtitleAs={ResponsiveDialogDescription}
          trailing={
            locked ? (
              <Badge
                variant="outline"
                className="shrink-0 gap-1 text-muted-foreground"
              >
                <LockSimpleIcon weight="bold" /> Locked
              </Badge>
            ) : null
          }
        />
      </ResponsiveDialogHeader>

      <div className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-4 pb-4">
        <PrerequisitesSection node={node} />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
          <ArchetypeAttributesGrid archetype={archetype} />
          <ArchetypeAffinitiesChart archetype={archetype} />
        </div>

        <ArchetypeTalents archetype={archetype} />

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-3">
          <DetailSection title={`Mastery (Rank ${MASTERY_RANK})`}>
            <p className="text-sm">
              {formatMasteryDescription(archetype.mastery)}
            </p>
          </DetailSection>
          <DetailSection title="Inheritance Slots">
            <p className="text-sm tabular-nums">{archetype.inheritanceSlots}</p>
          </DetailSection>
          <DetailSection title="Recommended Path">
            <p className="text-sm">{SUGGESTED_PATH_LABELS[suggestedPath]}</p>
          </DetailSection>
        </div>

        <ArchetypeMechanicProse archetype={archetype} />

        <Separator />

        <ArchetypeResolvedSkills
          ranks={ranks}
          currentRank={ownedRank}
          attributes={attributes}
        />

        {synthesis ? (
          <DetailSection title="Synthesis Skill">
            <ItemGroup className="gap-0">
              <ResolvedSkillRow
                view={buildSkillCardView(synthesis, attributes)}
              />
            </ItemGroup>
          </DetailSection>
        ) : null}
      </div>

      <ResponsiveDialogFooter className="flex-row items-center justify-between border-t">
        <OwnerOnly>
          <p className="flex items-baseline gap-1.5 text-sm">
            <span className="text-muted-foreground">Saved Ranks</span>
            <span className="font-semibold tabular-nums">{savedRanks}</span>
            <span className="text-muted-foreground">unspent</span>
          </p>
        </OwnerOnly>
        <div className="flex items-center gap-2">
          <Button variant="ghost" onClick={onClose}>
            Close
          </Button>
          {/* Owner-gated for affordance only; `spendArchetypeRank` enforces
              `requireOwner` server-side regardless. */}
          <OwnerOnly>
            <ArchetypeActionButton
              archetype={archetype}
              state={state}
              savedRanks={savedRanks}
            />
          </OwnerOnly>
        </div>
      </ResponsiveDialogFooter>
    </ResponsiveDialogContent>
  )
}

function PrerequisitesSection({ node }: { node: AtlasNode }) {
  const { archetype, state } = node
  if (archetype.prerequisites.length === 0) {
    return (
      <DetailSection title="Prerequisites">
        <span className="text-sm text-muted-foreground">None</span>
      </DetailSection>
    )
  }

  const unmetKeys = new Set(
    state.kind === "locked"
      ? state.unmetPrerequisites.map(
          (prereq) => `${prereq.archetype}:${prereq.rank}`
        )
      : []
  )

  return (
    <DetailSection title="Prerequisites">
      <ul className="flex flex-col gap-1">
        {archetype.prerequisites.map((prereq) => {
          const unmet = unmetKeys.has(`${prereq.archetype}:${prereq.rank}`)
          const name = getArchetype(prereq.archetype)?.name ?? prereq.archetype
          return (
            <li
              key={`${prereq.archetype}:${prereq.rank}`}
              className="flex items-center gap-1.5 text-sm"
            >
              {unmet ? (
                <LockSimpleIcon
                  weight="bold"
                  className="text-muted-foreground"
                  aria-hidden
                />
              ) : null}
              <span className={unmet ? "text-muted-foreground" : undefined}>
                {name} Rank {prereq.rank}
              </span>
            </li>
          )
        })}
      </ul>
    </DetailSection>
  )
}
