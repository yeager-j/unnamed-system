"use client"

import { Badge } from "@workspace/ui/components/badge"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@workspace/ui/components/popover"

import { DamageTypeBadge } from "@/components/shared/damage-type-badge"
import { PopoverCardShell } from "@/components/shared/popover-card-shell"
import { SkillKindBadge } from "@/components/shared/skill-kind-badge"
import { SkillText } from "@/components/shared/skill-text"
import type { Skill } from "@/lib/game/skills"

/**
 * A catalog enemy's skill as a click-to-open badge in the combat drawer
 * (UNN-345). The popover shows the **un-hydrated** skill — name, kind/damage-type
 * header, description, and any Effect prose — deliberately omitting the
 * character-resolved cost and Attack Roll table the full
 * {@link import("@/components/shared/skill-card").SkillCard} renders: those need a
 * {@link import("@/lib/game/character").HydratedSkill}, which only a character can
 * produce. This is the "better than a bare name" middle ground for enemies, who
 * are not characters and whose attack math lives in their freeform abilities.
 */
export function EnemySkillPopover({ skill }: { skill: Skill }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <Badge
            variant="secondary"
            className="cursor-pointer"
            render={<button type="button" />}
          />
        }
      >
        {skill.name}
      </PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={6}
        className="w-72"
        initialFocus={false}
      >
        <PopoverCardShell
          title={skill.name}
          subtitle={skill.tagline}
          badge={
            skill.kind === "attack" ? (
              <DamageTypeBadge damageType={skill.damageType} />
            ) : (
              <SkillKindBadge kind={skill.kind} />
            )
          }
        >
          <SkillText>{skill.description}</SkillText>
          {skill.effect ? (
            <SkillText className="border-t border-border pt-2">
              {skill.effect}
            </SkillText>
          ) : null}
        </PopoverCardShell>
      </PopoverContent>
    </Popover>
  )
}
