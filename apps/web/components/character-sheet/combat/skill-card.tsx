"use client"

import type { AttackTier } from "@workspace/game-v2/combat/attack.schema"
import {
  foldDamageBonuses,
  renderFormula,
} from "@workspace/game-v2/combat/formula"
import type { ResolvedAttackRoll } from "@workspace/game-v2/combat/resolved"
import type { AttributeScores } from "@workspace/game-v2/kernel/vocab"
import {
  formatSignedBonus,
  hydrateFormulaText,
} from "@workspace/game-v2/skills/formula-text"
import type { ResolvedSkill } from "@workspace/game-v2/skills/resolved"
import { Button } from "@workspace/ui/components/button"
import { MetaChip } from "@workspace/ui/components/meta-chip"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { rangeLabel } from "@/components/shared/resolved-skill-card-utils"
import { SideEffectBadge } from "@/components/shared/side-effect-badge"
import { SkillText } from "@/components/shared/skill-text"
import {
  DAMAGE_TYPE_LABELS,
  DELIVERY_LABELS,
  SKILL_KIND_LABELS,
} from "@/lib/ui/labels"

import { ELEMENT_GLYPHS, elementTone, type ElementKey } from "./element-tokens"

/**
 * The Banner Skill card (design handoff `SkillCard.dc.html` — the
 * high-fidelity component): element-tinted banner header (glow + glyph
 * watermark, type chip, cost coin, display-serif name), one-line description,
 * meta chips, the damage ladder for rolling Skills (`D20 + N` header in the
 * element hue, crit row de-emphasized, breakdown in a tooltip), the
 * source-labelled effect line, and Use Skill.
 *
 * Consumes {@link ResolvedSkill} directly — the shared v2 skill vocabulary
 * (UNN-538's drawer adopts the same renderer), with the formula work done by
 * the engine's `renderFormula`/`foldDamageBonuses` (no string surgery).
 */
export function SkillCard({
  resolved,
  attributes,
  sourceLabel,
  onUse,
  useDisabled,
  showUse,
}: {
  resolved: ResolvedSkill
  attributes: AttributeScores
  sourceLabel?: string
  onUse?: () => void
  useDisabled?: boolean
  showUse: boolean
}) {
  const { skill } = resolved
  const element: ElementKey = skill.damage?.damageType ?? "support"
  const tone = elementTone(element)
  const Glyph = ELEMENT_GLYPHS[element]

  const typeChip = skill.damage
    ? `${DAMAGE_TYPE_LABELS[skill.damage.damageType]} · ${DELIVERY_LABELS[skill.damage.delivery]}`
    : SKILL_KIND_LABELS[skill.kind]

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <header
        className={cn(
          "relative flex flex-col gap-2 bg-gradient-to-bl to-transparent p-3 pb-2.5",
          tone.banner
        )}
      >
        <Glyph
          aria-hidden
          weight="fill"
          className={cn(
            "pointer-events-none absolute -top-2 -right-2 size-16 opacity-15",
            tone.text
          )}
        />
        <div className="flex items-start justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wide uppercase",
              tone.chip
            )}
          >
            <Glyph aria-hidden className="size-3" />
            {typeChip}
          </span>
          {resolved.resolvedCost ? (
            <CostCoin cost={resolved.resolvedCost} />
          ) : null}
        </div>
        <h3 className="font-display text-lg leading-tight">{skill.name}</h3>
      </header>

      <div className="flex flex-1 flex-col gap-2.5 p-3 pt-2">
        <p className="line-clamp-2 text-xs text-muted-foreground">
          {skill.tagline}
        </p>

        <div className="flex flex-wrap gap-1">
          {skill.cost ? (
            <MetaChip
              label="Cost"
              value={
                skill.cost.kind === "sp"
                  ? `${skill.cost.amount} SP`
                  : `${skill.cost.amount}% HP`
              }
            />
          ) : null}
          {skill.range ? (
            <MetaChip label="Range" value={rangeLabel(skill.range)} />
          ) : null}
          {showTargets(skill.targets) ? (
            <MetaChip label="Targets" value={skill.targets} />
          ) : null}
          {skill.damage?.hits ? (
            <MetaChip label="Hits" value={skill.damage.hits} />
          ) : null}
          {!skill.attackRoll && skill.formula ? (
            <MetaChip
              label={skill.kind === "heal" ? "Healing" : "Damage"}
              value={hydrateFormulaText(skill.formula, attributes)}
            />
          ) : null}
          {skill.duration ? (
            <MetaChip
              label="Duration"
              value={`${skill.duration} ${skill.duration === 1 ? "turn" : "turns"}`}
            />
          ) : null}
        </div>

        {skill.attackRoll && resolved.resolvedAttackRoll ? (
          <DamageLadder
            tiers={skill.attackRoll.tiers}
            roll={resolved.resolvedAttackRoll}
            resolved={resolved}
            attributes={attributes}
            tone={tone.headerRow}
          />
        ) : null}

        {skill.effect ? (
          <div className="text-xs">
            {sourceLabel ? (
              <span className="font-semibold text-muted-foreground">
                {sourceLabel} —{" "}
              </span>
            ) : null}
            <SkillText className="inline text-xs prose-p:inline [&_p]:inline">
              {skill.effect}
            </SkillText>
          </div>
        ) : null}

        {showUse && skill.cost ? (
          <Button
            variant="secondary"
            size="sm"
            className="mt-auto w-full"
            disabled={useDisabled}
            onClick={onUse}
          >
            Use Skill
          </Button>
        ) : null}
      </div>
    </article>
  )
}

/** The banner's circular cost coin: amount over pool (design handoff). */
function CostCoin({ cost }: { cost: { kind: "sp" | "hp"; amount: number } }) {
  return (
    <span
      className="flex size-9 shrink-0 flex-col items-center justify-center rounded-full border bg-background/70 leading-none"
      aria-label={`Costs ${cost.amount} ${cost.kind.toUpperCase()}`}
    >
      <span className="text-xs font-semibold tabular-nums">{cost.amount}</span>
      <span className="text-[8px] text-muted-foreground uppercase">
        {cost.kind}
      </span>
    </span>
  )
}

/** `Targets` renders only when the Skill hits more than one target (design
 *  handoff: single-target is redundant). "Self" and party strings still show. */
function showTargets(targets: string | undefined): targets is string {
  if (!targets) return false
  return !/^1(\s|$)/.test(targets.trim())
}

/**
 * The bordered tier table: element-hued header (`D20 + N` never wraps, with
 * the per-source breakdown in a tooltip), one row per d20 band with its
 * bonus-folded damage formula and effect tags, the crit row de-emphasized.
 */
function DamageLadder({
  tiers,
  roll,
  resolved,
  attributes,
  tone,
}: {
  tiers: AttackTier[]
  roll: ResolvedAttackRoll
  resolved: ResolvedSkill
  attributes: AttributeScores
  tone: string
}) {
  const bonusTerms = resolved.resolvedDamageBonuses.map((bonus) => bonus.term)
  const breakdown = roll.sources
    .map((source) => `${source.source} ${formatSignedBonus(source.amount)}`)
    .join(" · ")

  return (
    <div className="overflow-hidden rounded-md border">
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className={cn(
                "grid cursor-default grid-cols-[auto_1fr_auto] items-baseline gap-x-3 px-2.5 py-1.5 text-[10px] font-semibold tracking-wide uppercase",
                tone
              )}
            />
          }
        >
          <span className="text-sm font-bold whitespace-nowrap normal-case">
            D20&nbsp;{formatSignedBonus(roll.total)}
          </span>
          <span>Damage</span>
          <span>Effect</span>
        </TooltipTrigger>
        <TooltipContent side="top">{breakdown}</TooltipContent>
      </Tooltip>
      <ul className="divide-y">
        {tiers.map((tier) => {
          const crit = tier.band.includes("+")
          return (
            <li
              key={tier.band}
              className="grid grid-cols-[auto_1fr_auto] items-center gap-x-3 px-2.5 py-1.5 text-xs"
            >
              <span
                className={cn(
                  "w-10 font-mono tabular-nums",
                  crit ? "text-muted-foreground" : "font-medium"
                )}
              >
                {tier.band}
              </span>
              <span className="font-mono">
                {tier.formula
                  ? renderFormula(
                      foldDamageBonuses(tier.formula, bonusTerms),
                      attributes
                    )
                  : "—"}
              </span>
              <span className="flex justify-end gap-1">
                {tier.sideEffects.map((key) => (
                  <SideEffectBadge key={key} sideEffectKey={key} />
                ))}
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
