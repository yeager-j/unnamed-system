import { Badge } from "@workspace/ui/components/badge"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"

import { useCharacter } from "@/hooks/use-character"
import type { AttackRange, AttackRoll, Range } from "@/lib/game/attack"
import type { ResolvedAttackRoll } from "@/lib/game/attack-roll"
import type { HydratedSkill } from "@/lib/game/hydrated-character"
import type { IntrinsicAttack, Weapon } from "@/lib/game/items/schema"
import { getSideEffect, type SideEffectKey } from "@/lib/game/side-effects"
import type { ResolvedSkillCost } from "@/lib/game/skill-cost"
import { formatSignedBonus, hydrateFormula } from "@/lib/game/skill-display"
import type { Skill } from "@/lib/game/skills/schema"
import type { AttributeScores } from "@/lib/game/stats"
import {
  DAMAGE_TYPE_LABELS,
  DELIVERY_LABELS,
  SKILL_KIND_LABELS,
} from "@/lib/ui/labels"

import { Prose } from "./prose"
import { SkillCostBadge } from "./skill-cost-badge"
import { SkillText } from "./skill-text"

interface SkillCardProps {
  skill: HydratedSkill
}

/**
 * The popover body for a Skill row. Renders the Skill's name, kind tag,
 * description, an applicable-fields-only stats grid, the Attack Roll table
 * (for Skills that have one), and any freeform Effect prose. Damage and
 * healing formulas and the Attack Roll header are hydrated with the
 * character's resolved attribute scores so the player sees `+ 4` instead of
 * `+ Ma`.
 */
export function SkillCard({ skill }: SkillCardProps) {
  const { attributes } = useCharacter()

  return (
    <CardShell title={skill.name} kindLabel={SKILL_KIND_LABELS[skill.kind]}>
      <SkillText>{skill.description}</SkillText>
      <StatsGrid rows={skillStatRows(skill, skill.resolvedCost, attributes)} />
      {"attackRoll" in skill && skill.attackRoll && skill.resolvedAttackRoll ? (
        <AttackRollTable
          roll={skill.attackRoll}
          resolved={skill.resolvedAttackRoll}
          attributes={attributes}
        />
      ) : null}
      {skill.effect ? (
        <SkillText className="border-t border-border pt-2">
          {skill.effect}
        </SkillText>
      ) : null}
    </CardShell>
  )
}

interface IntrinsicAttackCardProps {
  weapon: Weapon
}

/**
 * The popover body for the equipped weapon's intrinsic attack. Mirrors
 * {@link SkillCard} structurally but reads off {@link IntrinsicAttack} — no
 * cost row, no description prose, no Effect block. The intrinsic attack is
 * always an attack, so the kind badge is fixed.
 */
export function IntrinsicAttackCard({ weapon }: IntrinsicAttackCardProps) {
  const attack = weapon.intrinsicAttack
  const { weaponAttackRoll, attributes } = useCharacter()
  if (!weaponAttackRoll) return null
  return (
    <CardShell
      title={weapon.name}
      kindLabel="Attack"
      subtitle="Equipped weapon"
    >
      <SkillText>Intrinsic weapon attack.</SkillText>
      <StatsGrid rows={intrinsicAttackStatRows(attack)} />
      <AttackRollTable
        roll={attack.attackRoll}
        resolved={weaponAttackRoll}
        attributes={attributes}
      />
    </CardShell>
  )
}

function CardShell({
  title,
  subtitle,
  kindLabel,
  children,
}: {
  title: string
  subtitle?: string
  kindLabel: string
  children: React.ReactNode
}) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex flex-col">
          <h3 className="text-base leading-tight font-semibold">{title}</h3>
          {subtitle ? (
            <span className="text-xs text-muted-foreground">{subtitle}</span>
          ) : null}
        </div>
        <Badge variant="outline" className="shrink-0">
          {kindLabel}
        </Badge>
      </div>
      {children}
    </div>
  )
}

interface StatRow {
  label: string
  value: React.ReactNode
}

function StatsGrid({ rows }: { rows: StatRow[] }) {
  if (rows.length === 0) return null
  return (
    <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1.5 text-sm">
      {rows.map((row) => (
        <div key={row.label} className="contents">
          <dt className="text-muted-foreground">{row.label}</dt>
          <dd className="flex flex-wrap items-center gap-1.5">{row.value}</dd>
        </div>
      ))}
    </dl>
  )
}

function skillStatRows(
  skill: Skill,
  cost: ResolvedSkillCost | null,
  attributes: AttributeScores
): StatRow[] {
  const rows: StatRow[] = []

  if (cost) {
    rows.push({ label: "Cost", value: <SkillCostBadge cost={cost} /> })
  }

  if ("range" in skill) {
    rows.push({
      label: "Range",
      value: <Badge variant="secondary">{rangeLabel(skill.range)}</Badge>,
    })
  }

  if (skill.kind === "attack") {
    rows.push({ label: "Damage", value: damageBadges(skill, attributes) })
    if (skill.hits) {
      rows.push({ label: "Hits", value: <span>{skill.hits}</span> })
    }
  }

  if (skill.kind === "heal" && skill.formula) {
    rows.push({
      label: "Healing",
      value: (
        <Badge variant="secondary">
          {hydrateFormula(skill.formula, attributes)}
        </Badge>
      ),
    })
  }

  if (skill.kind === "support" && skill.duration) {
    rows.push({
      label: "Duration",
      value: (
        <span>
          {skill.duration} {skill.duration === 1 ? "turn" : "turns"}
        </span>
      ),
    })
  }

  if ("targets" in skill && skill.targets) {
    rows.push({ label: "Targets", value: <span>{skill.targets}</span> })
  }

  return rows
}

function damageBadges(
  skill: Extract<Skill, { kind: "attack" }>,
  attributes: AttributeScores
) {
  const typeLabel = `${DAMAGE_TYPE_LABELS[skill.damageType]} (${DELIVERY_LABELS[skill.delivery]})`
  return (
    <>
      {skill.damage ? (
        <Badge variant="secondary">
          {hydrateFormula(skill.damage, attributes)}
        </Badge>
      ) : null}
      <Badge variant="secondary">{typeLabel}</Badge>
    </>
  )
}

function intrinsicAttackStatRows(attack: IntrinsicAttack): StatRow[] {
  return [
    {
      label: "Range",
      value: <Badge variant="secondary">{rangeLabel(attack.range)}</Badge>,
    },
    {
      label: "Damage",
      value: (
        <Badge variant="secondary">
          {DAMAGE_TYPE_LABELS[attack.damageType]} (
          {DELIVERY_LABELS[attack.delivery]})
        </Badge>
      ),
    },
  ]
}

function AttackRollTable({
  roll,
  resolved,
  attributes,
}: {
  roll: AttackRoll
  resolved: ResolvedAttackRoll
  attributes: AttributeScores
}) {
  return (
    <section className="border-t border-border pt-3">
      <h4 className="mb-1.5 text-xs font-semibold tracking-wide uppercase">
        Attack Roll {formatSignedBonus(resolved.total)}
      </h4>
      <AttackRollBreakdown resolved={resolved} />
      <ul className="flex flex-col gap-1.5 text-sm">
        {roll.tiers.map((tier) => (
          <li
            key={tier.band}
            className="flex flex-wrap items-center gap-x-2 gap-y-1"
          >
            <Badge variant="outline" className="w-14 font-mono">
              {tier.band}
            </Badge>
            {tier.formula ? (
              <span className="font-mono text-sm">
                {hydrateFormula(tier.formula, attributes)}
              </span>
            ) : null}
            {tier.sideEffects.map((key) => (
              <SideEffectBadge key={key} sideEffectKey={key} />
            ))}
          </li>
        ))}
      </ul>
    </section>
  )
}

/**
 * One Side Effect chip in an Attack Roll tier row. The Badge shows the canonical
 * name (e.g. "Critical", "Insta-Kill (Light)") and the tooltip renders the
 * side effect's rule description from the registry. Unknown keys are skipped —
 * the schema rejects them at parse time, but this guards against bad
 * persisted data slipping through.
 */
function SideEffectBadge({ sideEffectKey }: { sideEffectKey: SideEffectKey }) {
  const sideEffect = getSideEffect(sideEffectKey)
  if (!sideEffect) return null
  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <Badge variant="secondary" className="cursor-help">
            {sideEffect.name}
          </Badge>
        }
      />
      {sideEffect.description ? (
        <TooltipContent side="top" className="max-w-sm">
          <Prose inverted className="prose-xs whitespace-normal">
            {sideEffect.description}
          </Prose>
        </TooltipContent>
      ) : null}
    </Tooltip>
  )
}

/**
 * Inline attribution row under the Attack Roll header. Hidden when only the
 * rolling Attribute contributes (the header alone is already complete in
 * that case); surfaces every mechanic- or passive-Skill-supplied contributor
 * when one or more is active.
 */
function AttackRollBreakdown({ resolved }: { resolved: ResolvedAttackRoll }) {
  if (resolved.sources.length <= 1) return null
  return (
    <p className="mb-2 font-mono text-xs text-muted-foreground">
      {resolved.sources
        .map((part) => `${part.source} ${formatSignedBonus(part.amount)}`)
        .join("  ")}
    </p>
  )
}

function rangeLabel(range: AttackRange): string {
  return range.kind === "known" ? KNOWN_RANGE_LABELS[range.value] : range.value
}

const KNOWN_RANGE_LABELS: Record<Range, string> = {
  engaged: "Engaged",
  "all-engaged": "All Engaged",
  "same-zone": "Same Zone",
  "same-or-adjacent-zone": "Same/Adjacent Zone",
}
