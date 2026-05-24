"use client"

import { CheckCircleIcon } from "@phosphor-icons/react/dist/ssr"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardAction,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from "@workspace/ui/components/drawer"
import { ItemGroup } from "@workspace/ui/components/item"
import { Separator } from "@workspace/ui/components/separator"

import { hasNonNeutralAffinities } from "@/components/archetype/archetype-affinities"
import { ArchetypeAffinitiesChart } from "@/components/archetype/archetype-affinities-chart"
import { ArchetypeAffinityChips } from "@/components/archetype/archetype-affinity-chips"
import { ArchetypeAttributesGrid } from "@/components/archetype/archetype-attributes-grid"
import { ArchetypeAttributesInline } from "@/components/archetype/archetype-attributes-inline"
import { ArchetypeMechanicProse } from "@/components/archetype/archetype-mechanic-prose"
import { ArchetypeRankedSkills } from "@/components/archetype/archetype-ranked-skills"
import {
  ArchetypeSkillChips,
  ArchetypeSynthesisChip,
} from "@/components/archetype/archetype-skill-chips"
import {
  ArchetypeTalentChips,
  ArchetypeTalents,
} from "@/components/archetype/archetype-talents"
import { formatMasteryDescription } from "@/components/archetype/format"
import { DetailSection } from "@/components/character-sheet/shared/detail-section"
import { SkillRow } from "@/components/character-sheet/skill-row"
import { useDrawerDirection } from "@/hooks/use-drawer-direction"
import { previewArchetypeSkills } from "@/lib/game/archetypes/preview"
import type { Archetype } from "@/lib/game/archetypes/schema"
import type { PathChoice } from "@/lib/game/character"
import { getMechanic } from "@/lib/game/mechanics"
import { LINEAGE_LABELS, TIER_LABELS } from "@/lib/ui/labels"

interface OriginArchetypeCardProps {
  archetype: Archetype
  pathChoice: PathChoice
  selected: boolean
  pending: boolean
  onSelect: () => void
}

/**
 * One Archetype card in the builder's Origin picker. Built on the shadcn Card
 * primitive: the at-a-glance summary lives in the body, contextual badges
 * (Mastery + Origin) sit in the header's action slot, and the "Show details"
 * + "Select as Origin" controls live in the footer. The `selected` flag rides
 * the Card's selection ring so the picked card stands out across the page.
 *
 * Composes the shared archetype atoms from [`components/archetype/`](../../archetype) —
 * the card never imports from `components/character-sheet/` for
 * content-shaping logic; `SkillRow` is the one cross-feature primitive it
 * uses, exposed through the shared archetype detail block.
 */
export function OriginArchetypeCard({
  archetype,
  pathChoice,
  selected,
  pending,
  onSelect,
}: OriginArchetypeCardProps) {
  const drawerDirection = useDrawerDirection()
  const mechanic = archetype.mechanic ? getMechanic(archetype.mechanic) : null
  const { ranks, synthesis } = previewArchetypeSkills(archetype, pathChoice)

  return (
    <Card selected={selected}>
      <CardHeader>
        <CardTitle className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
          <span className="text-base">{archetype.name}</span>
          {mechanic ? (
            <Badge variant="outline">{mechanic.displayName}</Badge>
          ) : null}
        </CardTitle>
        <CardDescription>
          {LINEAGE_LABELS[archetype.lineage]} · {TIER_LABELS[archetype.tier]}
        </CardDescription>
        <CardAction className="flex flex-wrap items-center gap-1.5">
          {selected ? (
            <Badge>
              <CheckCircleIcon weight="fill" className="size-3.5" /> Origin
            </Badge>
          ) : null}
          <Badge variant="secondary">
            Mastery: {formatMasteryDescription(archetype.mastery)}
          </Badge>
        </CardAction>
      </CardHeader>

      <CardContent className="flex flex-col gap-2">
        <ArchetypeAttributesInline archetype={archetype} />

        {hasNonNeutralAffinities(archetype) ? (
          <DetailSection inline title="Affinities">
            <ArchetypeAffinityChips archetype={archetype} />
          </DetailSection>
        ) : null}

        {archetype.talents.length > 0 ? (
          <DetailSection inline title="Talents">
            <ArchetypeTalentChips archetype={archetype} />
          </DetailSection>
        ) : null}

        {ranks.length > 0 ? (
          <DetailSection inline title="Skills">
            <ArchetypeSkillChips skills={ranks} />
          </DetailSection>
        ) : null}

        {synthesis ? (
          <DetailSection inline title="Synthesis">
            <ArchetypeSynthesisChip synthesis={synthesis} />
          </DetailSection>
        ) : null}
      </CardContent>

      <CardFooter className="justify-end gap-2">
        <Drawer direction={drawerDirection}>
          <DrawerTrigger asChild>
            <Button variant="ghost" size="sm">
              Show details
            </Button>
          </DrawerTrigger>
          <DrawerContent className="data-[vaul-drawer-direction=right]:sm:max-w-xl">
            <DrawerHeader>
              <DrawerTitle>{archetype.name}</DrawerTitle>
              <DrawerDescription>
                {LINEAGE_LABELS[archetype.lineage]} ·{" "}
                {TIER_LABELS[archetype.tier]}
              </DrawerDescription>
            </DrawerHeader>
            <div className="flex flex-col gap-6 overflow-y-auto px-4 pb-8">
              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <ArchetypeAttributesGrid archetype={archetype} />
                <ArchetypeAffinitiesChart archetype={archetype} />
              </div>
              <ArchetypeTalents archetype={archetype} />
              <ArchetypeMechanicProse archetype={archetype} />
              <Separator />
              <ArchetypeRankedSkills
                ranks={ranks}
                attributes={archetype.attributes}
              />
              {synthesis ? (
                <DetailSection title="Synthesis Skill">
                  <ItemGroup className="gap-0">
                    <SkillRow
                      skill={synthesis}
                      attributes={archetype.attributes}
                    />
                  </ItemGroup>
                </DetailSection>
              ) : null}
            </div>
          </DrawerContent>
        </Drawer>
        <Button
          type="button"
          variant={selected ? "secondary" : "default"}
          size="sm"
          disabled={pending || selected}
          onClick={onSelect}
        >
          {selected ? "Selected" : "Select as Origin"}
        </Button>
      </CardFooter>
    </Card>
  )
}
