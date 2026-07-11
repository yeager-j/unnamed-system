"use client"

import type { CSSProperties } from "react"

import { Button } from "@workspace/ui/components/button"
import { MetaChip } from "@workspace/ui/components/meta-chip"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { cn } from "@workspace/ui/lib/utils"

import { SideEffectBadge } from "@/components/shared/side-effect-badge"
import { SkillText } from "@/components/shared/skill-text"
import type {
  SkillCardCost,
  SkillCardLadder,
  SkillCardView,
} from "@/domain/combat/view/skill-card-view"
import { COST_KIND_LABELS } from "@/domain/labels"

import { ELEMENT_GLYPHS, elementTone, type ElementTone } from "./element-tokens"

/**
 * The Banner Skill card (design handoff `SkillCard.dc.html` — the
 * high-fidelity component): a tall element-tinted banner (diagonal hatch +
 * glyph watermark, element chip top-left, authored-cost coin top-right,
 * display-serif name at the banner's foot), description, meta chips, the
 * damage ladder for rolling Skills (`D20 + N` header in the element hue with
 * the breakdown in a tooltip), the source-labelled effect line, and Use Skill.
 *
 * Renders a {@link SkillCardView} — the app-owned shape the `skill-card-view`
 * builder folds a resolved Skill into. All formula work is the engine's, done
 * in that builder; this component is layout-only (UNN-583). The Combat tab
 * renders it as a grid tile (with **Use Skill**); every skill row's preview
 * popover (`ResolvedSkillRow`) renders the same card with `showUse={false}`, so
 * a skill reads identically wherever it surfaces (S2d — UNN-560).
 */
export function SkillBannerCard({
  view,
  onUse,
  useDisabled,
  showUse,
  showCost = true,
}: {
  view: SkillCardView
  onUse?: () => void
  useDisabled?: boolean
  showUse: boolean
  /** Whether to render the cost coin + Cost meta chip. Defaults to `true`; a
   *  caller whose entity resolves no Skill Pool (no SP resource) passes `false`,
   *  since a cost with no pool to pay it from would mislead. */
  showCost?: boolean
}) {
  const tone = elementTone(view.element)
  const Glyph = ELEMENT_GLYPHS[view.element]

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
            {view.chipLabel}
          </span>
          {showCost && view.cost ? <CostCoin cost={view.cost} /> : null}
        </div>
        <h3 className="relative font-display text-2xl leading-none">
          {view.name}
        </h3>
      </header>

      <div className="flex flex-1 flex-col gap-3 p-3">
        <p className="line-clamp-2 text-sm text-muted-foreground">
          {view.tagline}
        </p>

        <div className="flex flex-wrap gap-1.5">
          {showCost && view.cost ? (
            <MetaChip
              label="Cost"
              variant={view.cost.kind === "sp" ? "sp" : "hp"}
              value={`${view.cost.amount} ${COST_KIND_LABELS[view.cost.kind]}`}
            />
          ) : null}
          {view.metaChips.map((chip) => (
            <MetaChip key={chip.label} label={chip.label} value={chip.value} />
          ))}
        </div>

        {view.ladder ? <DamageLadder ladder={view.ladder} tone={tone} /> : null}

        {view.effect ? (
          <div className="text-xs">
            <SkillText className="inline text-xs prose-p:inline [&_p]:inline">
              {view.effect}
            </SkillText>
          </div>
        ) : null}

        {showUse && view.castable ? (
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
function CostCoin({ cost }: { cost: SkillCardCost }) {
  const pool = COST_KIND_LABELS[cost.kind]
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

/**
 * The tier table: an element-hued header row (`D20 + N` never wraps; the
 * per-source breakdown in a tooltip) over hairline-separated band rows with
 * bonus-folded damage formulas (`1d10 + 4`) and hue-tinted effect tags.
 */
function DamageLadder({
  ladder,
  tone,
}: {
  ladder: SkillCardLadder
  tone: ElementTone
}) {
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
            {ladder.header}
          </span>
          <span className="text-primary-foreground/60">Damage</span>
          <span className="text-primary-foreground/60">Effect</span>
        </TooltipTrigger>
        <TooltipContent side="top">{ladder.breakdown}</TooltipContent>
      </Tooltip>
      <ul>
        {ladder.rows.map((row) => (
          <li
            key={row.band}
            className="grid grid-cols-[3.75rem_1fr_auto] items-center gap-x-3 border-b border-border/60 px-2.5 py-1.5 text-sm last:border-b-0"
          >
            <span className="font-mono text-xs font-bold text-muted-foreground tabular-nums">
              {row.band}
            </span>
            <span className="font-mono text-sm">{row.formula}</span>
            <span className="flex flex-wrap justify-end gap-1">
              {row.sideEffects.map((sideEffect) => (
                <SideEffectBadge
                  key={sideEffect.name}
                  sideEffect={sideEffect}
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
