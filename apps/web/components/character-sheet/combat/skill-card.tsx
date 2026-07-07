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
import type { SkillCost } from "@workspace/game-v2/skills/skill.schema"
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
import { DAMAGE_TYPE_LABELS, SKILL_KIND_LABELS } from "@/lib/ui/labels"

import { ELEMENT_GLYPHS, elementTone, type ElementKey } from "./element-tokens"

/**
 * The Banner Skill card (design handoff `SkillCard.dc.html` — the
 * high-fidelity component): a tall element-tinted banner (diagonal hatch +
 * glyph watermark, element chip top-left, authored-cost coin top-right,
 * display-serif name at the banner's foot), description, meta chips, the
 * damage ladder for rolling Skills (`D20 + N` header in the element hue with
 * the breakdown in a tooltip), the source-labelled effect line, and Use Skill.
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

  const chipLabel = skill.damage
    ? DAMAGE_TYPE_LABELS[skill.damage.damageType]
    : SKILL_KIND_LABELS[skill.kind]

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <header
        className={cn(
          "relative flex min-h-28 flex-col justify-between gap-3 bg-gradient-to-bl to-transparent p-3",
          tone.banner
        )}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent,transparent_7px,rgb(255_255_255/0.035)_7px,rgb(255_255_255/0.035)_9px)]"
        />
        <Glyph
          aria-hidden
          weight="fill"
          className={cn(
            "pointer-events-none absolute top-1/2 right-3 size-24 -translate-y-1/2 opacity-15",
            tone.text
          )}
        />
        <div className="relative flex items-start justify-between gap-2">
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-wider uppercase",
              tone.chip
            )}
          >
            <Glyph aria-hidden className="size-3" />
            {chipLabel}
          </span>
          {skill.cost ? <CostCoin cost={skill.cost} /> : null}
        </div>
        <h3 className="relative font-display text-2xl leading-none">
          {skill.name}
        </h3>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {skill.tagline}
        </p>

        <div className="flex flex-wrap gap-1.5">
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
          <div className="text-sm">
            {sourceLabel ? (
              <span className="font-semibold">{sourceLabel} — </span>
            ) : null}
            <SkillText className="inline text-sm prose-p:inline [&_p]:inline">
              {skill.effect}
            </SkillText>
          </div>
        ) : null}

        {showUse && skill.cost ? (
          <div className="mt-auto pt-1">
            <Button
              variant="secondary"
              size="sm"
              disabled={useDisabled}
              onClick={onUse}
            >
              Use Skill
            </Button>
          </div>
        ) : null}
      </div>
    </article>
  )
}

/** The banner's circular cost coin — the AUTHORED cost (`5%`/`HP`, `4`/`SP`),
 *  matching the design; the resolved absolute HP gates the Use button. */
function CostCoin({ cost }: { cost: SkillCost }) {
  const amount = cost.kind === "sp" ? `${cost.amount}` : `${cost.amount}%`
  const pool = cost.kind === "sp" ? "SP" : "HP"
  return (
    <span
      className="flex size-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border border-foreground/25 bg-background/60 leading-none backdrop-blur-sm"
      aria-label={`Costs ${amount} ${pool}`}
    >
      <span className="text-sm font-semibold tabular-nums">{amount}</span>
      <span className="text-[8px] text-muted-foreground uppercase">{pool}</span>
    </span>
  )
}

/** `Targets` renders only when the Skill hits more than one target (design
 *  handoff: single-target is redundant). "Self" and party strings still show. */
function showTargets(targets: string | undefined): targets is string {
  if (!targets) return false
  return !/^1(\s|$)/.test(targets.trim())
}

/** The design's compact dice spelling (`1d6+2`): joins tighten, multi-word
 *  attribute names (`St or Ma`) keep their internal spaces. */
function compactFormula(rendered: string): string {
  return rendered.replaceAll(" + ", "+").replaceAll(" − ", "−")
}

/**
 * The tier table: an element-hued header row (`D20 + N` never wraps; the
 * per-source breakdown in a tooltip) over hairline-separated band rows with
 * bonus-folded compact damage formulas and effect tags.
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
    <div className="overflow-hidden rounded-md">
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className={cn(
                "grid cursor-default grid-cols-[5.5rem_1fr_auto] items-baseline gap-x-3 rounded-md px-2.5 py-1.5 font-mono text-[10px] font-semibold tracking-wider uppercase",
                tone
              )}
            />
          }
        >
          <span className="text-sm font-bold whitespace-nowrap">
            D20 {formatSignedBonus(roll.total).replace(" ", " ")}
          </span>
          <span>Damage</span>
          <span>Effect</span>
        </TooltipTrigger>
        <TooltipContent side="top">{breakdown}</TooltipContent>
      </Tooltip>
      <ul>
        {tiers.map((tier) => (
          <li
            key={tier.band}
            className="grid grid-cols-[5.5rem_1fr_auto] items-center gap-x-3 border-b border-border/60 px-2.5 py-1.5 text-sm last:border-b-0"
          >
            <span className="font-mono text-xs text-muted-foreground tabular-nums">
              {tier.band}
            </span>
            <span className="font-mono text-sm">
              {tier.formula
                ? compactFormula(
                    renderFormula(
                      foldDamageBonuses(tier.formula, bonusTerms),
                      attributes
                    )
                  )
                : "—"}
            </span>
            <span className="flex justify-end gap-1">
              {tier.sideEffects.map((key) => (
                <SideEffectBadge key={key} sideEffectKey={key} />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
