import { Badge } from "@workspace/ui/components/badge"
import type {
  AttackAttribute,
  AttackRange,
  AttackRoll,
  Range,
} from "@/lib/game/attack"
import type { DamageType } from "@/lib/game/affinity"
import type { IntrinsicAttack, Weapon } from "@/lib/game/items/schema"
import type { ResolvedSkillCost } from "@/lib/game/skill-cost"
import type { Skill } from "@/lib/game/skills/schema"
import type { AttributeScores } from "@/lib/game/stats"
import { useCharacter } from "@/components/character-sheet/character-context"

interface SkillCardProps {
  skill: Skill
  cost: ResolvedSkillCost | null
}

/**
 * The popover body for a Skill row. Renders the Skill's name, kind tag,
 * description, an applicable-fields-only stats grid, the Attack Roll table
 * (for Skills that have one), and any freeform Effect prose. Damage and
 * healing formulas and the Attack Roll header are hydrated with the
 * character's resolved attribute scores so the player sees `+ 4` instead of
 * `+ Ma`.
 */
export function SkillCard({ skill, cost }: SkillCardProps) {
  const { attributes } = useCharacter()

  return (
    <CardShell title={skill.name} kindLabel={SKILL_KIND_LABELS[skill.kind]}>
      <p className="text-sm leading-relaxed">{skill.description}</p>
      <StatsGrid rows={skillStatRows(skill, cost, attributes)} />
      {"attackRoll" in skill && skill.attackRoll ? (
        <AttackRollTable roll={skill.attackRoll} />
      ) : null}
      {skill.effect ? <EffectProse effect={skill.effect} /> : null}
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
  return (
    <CardShell
      title={weapon.name}
      kindLabel="Attack"
      subtitle="Equipped weapon"
    >
      <p className="text-sm leading-relaxed">Intrinsic weapon attack.</p>
      <StatsGrid rows={intrinsicAttackStatRows(attack)} />
      <AttackRollTable roll={attack.attackRoll} />
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
    rows.push({ label: "Cost", value: <Badge>{costLabel(cost)}</Badge> })
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

  if (skill.kind === "heal" && skill.damage) {
    rows.push({
      label: "Healing",
      value: (
        <Badge variant="secondary">
          {hydrateFormula(skill.damage, attributes)}
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

function AttackRollTable({ roll }: { roll: AttackRoll }) {
  const { attributes } = useCharacter()
  const headerBonus = resolveAttackAttribute(roll.attribute, attributes)
  return (
    <section className="border-t border-border pt-3">
      <h4 className="mb-1.5 text-xs font-semibold tracking-wide uppercase">
        Attack Roll {formatSignedBonus(headerBonus)}
      </h4>
      <ul className="flex flex-col gap-1.5 text-sm">
        {roll.tiers.map((tier) => (
          <li
            key={tier.band}
            className="flex flex-wrap items-baseline gap-x-2 gap-y-1"
          >
            <Badge variant="outline" className="w-14 font-mono">
              {tier.band}
            </Badge>
            <span className="font-mono text-sm">
              {hydrateFormula(tier.formula, attributes)}
            </span>
            {tier.sideEffects.length > 0 ? (
              <span className="text-muted-foreground italic">
                — {tier.sideEffects.join(", ")}
              </span>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  )
}

function EffectProse({ effect }: { effect: string }) {
  return (
    <p className="border-t border-border pt-2 text-sm leading-relaxed">
      {effect}
    </p>
  )
}

function costLabel(cost: ResolvedSkillCost): string {
  return cost.kind === "sp" ? `${cost.amount} SP` : `${cost.amount} HP`
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

const DAMAGE_TYPE_LABELS: Record<DamageType | "special", string> = {
  slash: "Slash",
  pierce: "Pierce",
  strike: "Strike",
  fire: "Fire",
  ice: "Ice",
  wind: "Wind",
  elec: "Elec",
  aether: "Aether",
  psy: "Psy",
  light: "Light",
  dark: "Dark",
  almighty: "Almighty",
  special: "Special",
}

const DELIVERY_LABELS: Record<"physical" | "magical", string> = {
  physical: "Physical",
  magical: "Magical",
}

const SKILL_KIND_LABELS: Record<Skill["kind"], string> = {
  attack: "Attack",
  heal: "Healing",
  support: "Support",
  passive: "Passive",
}

/**
 * Resolves an {@link AttackAttribute} symbol to the character's concrete
 * score. "st-or-ma" picks the higher of Strength and Magic per the rulebook
 * convention — the engine doesn't expose a separate "either" stat.
 */
function resolveAttackAttribute(
  attr: AttackAttribute,
  attributes: AttributeScores
): number {
  switch (attr) {
    case "st":
      return attributes.strength
    case "ma":
      return attributes.magic
    case "ag":
      return attributes.agility
    case "st-or-ma":
      return Math.max(attributes.strength, attributes.magic)
  }
}

/**
 * Substitutes attribute abbreviations in a damage / healing / tier formula
 * with the character's concrete scores so authored strings like `"1d8 + Ma"`
 * render as `"1d8 + 4"`. Handles a leading `+` / `-` operator so a negative
 * score renders as `"− 1"` instead of `"+ -1"`. The longer "St or Ma" pattern
 * is replaced first to avoid the bare "St" / "Ma" rules matching it twice.
 */
function hydrateFormula(formula: string, attributes: AttributeScores): string {
  return formula.replace(
    /\s*([+−-])\s*(St or Ma|St|Ma|Ag)\b/g,
    (_match, op: string, name: string) => {
      const base =
        name === "St or Ma"
          ? Math.max(attributes.strength, attributes.magic)
          : name === "St"
            ? attributes.strength
            : name === "Ma"
              ? attributes.magic
              : attributes.agility
      const signed = op === "+" ? base : -base
      return ` ${formatSignedBonus(signed)}`
    }
  )
}

function formatSignedBonus(value: number): string {
  return value < 0 ? `− ${Math.abs(value)}` : `+ ${value}`
}
