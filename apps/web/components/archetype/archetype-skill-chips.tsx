import { Badge } from "@workspace/ui/components/badge"

import type { RankedSkill } from "@/lib/game/archetypes"

/**
 * Compact name-only chips for a list of (already-filtered) Skills. The caller
 * does the rank-gating — passing only the unlocked Skills for a live-sheet
 * summary, or every Skill for the builder's catalog preview.
 */
export function ArchetypeSkillChips({ skills }: { skills: RankedSkill[] }) {
  if (skills.length === 0) return null
  return (
    <>
      {skills.map((skill) => (
        <Badge key={skill.key} variant="outline">
          {skill.name}
        </Badge>
      ))}
    </>
  )
}

/**
 * The single Synthesis-Skill chip, distinguished from regular Skill chips by
 * the primary-border accent. Caller surrounds it with its own Synthesis
 * section header so the chip itself stays a name-only badge.
 */
export function ArchetypeSynthesisChip({
  synthesis,
}: {
  synthesis: RankedSkill
}) {
  return (
    <Badge variant="outline" className="border-primary">
      {synthesis.name}
    </Badge>
  )
}
