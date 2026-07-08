"use client"

import type { CSSProperties } from "react"

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
import type { ResolvedSkillCost } from "@workspace/game-v2/skills/skill.schema"
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

import {
  ELEMENT_GLYPHS,
  elementKeyForSkill,
  elementTone,
  type ElementTone,
} from "./element-tokens"

/**
 * The Banner Skill card (design handoff `SkillCard.dc.html` — the
 * high-fidelity component): a tall element-tinted banner (diagonal hatch +
 * glyph watermark, element chip top-left, authored-cost coin top-right,
 * display-serif name at the banner's foot), description, meta chips, the
 * damage ladder for rolling Skills (`D20 + N` header in the element hue with
 * the breakdown in a tooltip), the source-labelled effect line, and Use Skill.
 *
 * Consumes {@link ResolvedSkill} directly — the shared v2 skill vocabulary.
 * The Combat tab renders it as a grid tile (with **Use Skill**); every skill
 * row's preview popover (`ResolvedSkillRow`) renders the same card with
 * `showUse={false}`, so a skill reads identically wherever it surfaces (S2d —
 * UNN-560). Formula work is the engine's (`renderFormula`/`foldDamageBonuses`).
 */
export function SkillBannerCard({
  resolved,
  attributes,
  onUse,
  useDisabled,
  showUse,
}: {
  resolved: ResolvedSkill
  attributes: AttributeScores
  onUse?: () => void
  useDisabled?: boolean
  showUse: boolean
}) {
  const { skill, resolvedCost } = resolved
  const element = elementKeyForSkill(skill)
  const tone = elementTone(element)
  const Glyph = ELEMENT_GLYPHS[element]

  const chipLabel = skill.damage
    ? DAMAGE_TYPE_LABELS[skill.damage.damageType]
    : SKILL_KIND_LABELS[skill.kind]

  return (
    <article className="flex flex-col overflow-hidden rounded-lg border bg-card">
      <header
        className="relative flex min-h-28 flex-col justify-between gap-3 bg-[color-mix(in_oklab,var(--banner-hue)_11%,var(--card))] p-3"
        style={{ "--banner-hue": tone.hueVar } as CSSProperties}
      >
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[repeating-linear-gradient(118deg,color-mix(in_oklab,var(--banner-hue)_13%,transparent)_0_2px,transparent_2px_11px)]"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-[radial-gradient(135%_130%_at_86%_-22%,color-mix(in_oklab,var(--banner-hue)_62%,transparent),transparent_60%)]"
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
          {resolvedCost ? <CostCoin cost={resolvedCost} /> : null}
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
          {resolvedCost ? (
            <MetaChip
              label="Cost"
              variant={resolvedCost.kind === "sp" ? "sp" : "hp"}
              value={
                resolvedCost.kind === "sp"
                  ? `${resolvedCost.amount} SP`
                  : `${resolvedCost.amount} HP`
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
            tone={tone}
          />
        ) : null}

        {skill.effect ? (
          <div className="text-xs">
            <SkillText className="inline text-xs prose-p:inline [&_p]:inline">
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
function CostCoin({ cost }: { cost: ResolvedSkillCost }) {
  const pool = cost.kind === "sp" ? "SP" : "HP"
  return (
    <span
      className="flex size-11 shrink-0 flex-col items-center justify-center gap-0.5 rounded-full border border-white/60 leading-none"
      aria-label={`Costs ${cost.amount} ${pool}`}
    >
      <span className="text-sm font-bold tabular-nums">{cost.amount}</span>
      <span className="text-[8px] text-white/80 uppercase">{pool}</span>
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
 * The tier table: an element-hued header row (`D20 + N` never wraps; the
 * per-source breakdown in a tooltip) over hairline-separated band rows with
 * bonus-folded damage formulas (`1d10 + 4`) and hue-tinted effect tags.
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
  tone: ElementTone
}) {
  const bonusTerms = resolved.resolvedDamageBonuses.map((bonus) => bonus.term)
  const breakdown = roll.sources
    .map((source) => `${source.source} ${formatSignedBonus(source.amount)}`)
    .join(" · ")

  return (
    <div className="overflow-hidden rounded-xl border border-border">
      <Tooltip>
        <TooltipTrigger
          render={
            <div
              className={cn(
                "grid cursor-default grid-cols-[3.75rem_1fr_auto] items-baseline gap-x-3 rounded-md px-2.5 py-1.5 font-mono text-xs font-bold tracking-wider uppercase",
                tone.headerRow
              )}
            />
          }
        >
          <span className="font-extrabold whitespace-nowrap">
            d20 {formatSignedBonus(roll.total).replace(" ", " ")}
          </span>
          <span className="text-primary-foreground/60">Damage</span>
          <span className="text-primary-foreground/60">Effect</span>
        </TooltipTrigger>
        <TooltipContent side="top">{breakdown}</TooltipContent>
      </Tooltip>
      <ul>
        {tiers.map((tier) => (
          <li
            key={tier.band}
            className="grid grid-cols-[3.75rem_1fr_auto] items-center gap-x-3 border-b border-border/60 px-2.5 py-1.5 text-sm last:border-b-0"
          >
            <span className="font-mono text-xs font-bold text-muted-foreground tabular-nums">
              {tier.band}
            </span>
            <span className="font-mono text-sm">
              {tier.formula
                ? renderFormula(
                    foldDamageBonuses(tier.formula, bonusTerms),
                    attributes
                  )
                : "—"}
            </span>
            <span className="flex flex-wrap justify-end gap-1">
              {tier.sideEffects.map((key) => (
                <SideEffectBadge
                  key={key}
                  sideEffectKey={key}
                  className={tone.chip}
                />
              ))}
            </span>
          </li>
        ))}
      </ul>
    </div>
  )
}
