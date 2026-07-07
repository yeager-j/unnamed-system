import {
  ArrowFatUpIcon,
  AsteriskIcon,
  BrainIcon,
  CrosshairIcon,
  FireIcon,
  GhostIcon,
  HandFistIcon,
  HeartStraightIcon,
  InfinityIcon,
  LightningIcon,
  MoonIcon,
  SkullIcon,
  SnowflakeIcon,
  SparkleIcon,
  SunIcon,
  SwordIcon,
  WindIcon,
  type Icon,
} from "@phosphor-icons/react"

import type { DamageType } from "@workspace/game-v2/kernel/vocab"
import type { SkillKind } from "@workspace/game-v2/kernel/vocab/skills"
import type { Skill } from "@workspace/game-v2/skills/skill.schema"

/**
 * The Skill-card element system (design handoff "Element color system",
 * implemented on the Tailwind palette per the S2a design call — no one-off
 * oklch values). Hues follow the established damage-type badge language
 * (`shared/damage-type-badge.tsx`): physicals earthy (mauve/mist/olive),
 * magicals their intuitive element color. Each tone is a set of literal class
 * strings (Tailwind statically extracts them) tuned for the dark theme:
 * `chip` for small bordered tokens, `text` for the hue's accent text, and
 * `headerRow` for the ladder's tinted header. `hueVar` is the hue's raw CSS
 * variable (not a class) — the banner feeds it into a `--banner-hue` custom
 * property so its glow + diagonal lines `color-mix` from the same palette color.
 *
 * Attacks key off their damage type; the non-damage Skill kinds carry their own
 * tone — `ailment` violet, `passive` neutral, `heal` emerald, `support` stone
 * (see {@link elementKeyForSkill}).
 */
export type ElementKey =
  | DamageType
  | "special"
  | "ailment"
  | "passive"
  | "heal"
  | "support"

export interface ElementTone {
  text: string
  chip: string
  headerRow: string
  hueVar: string
}

const TONES: Record<ElementKey, ElementTone> = {
  slash: tone("mauve"),
  pierce: tone("taupe"),
  strike: tone("olive"),
  fire: tone("red"),
  ice: tone("blue"),
  wind: tone("green"),
  elec: tone("yellow"),
  soul: tone("cyan"),
  mind: tone("purple"),
  light: tone("zinc"),
  dark: tone("slate"),
  almighty: tone("neutral"),
  special: tone("neutral"),
  ailment: tone("violet"),
  passive: tone("neutral"),
  heal: tone("emerald"),
  support: tone("stone"),
}

/**
 * The Skill's tone key: attacks by their damage type, every other kind by its
 * own hue. Damage wins when present, so an ailment-inflicting *attack* still
 * reads by its element.
 */
export function elementKeyForSkill(
  skill: Pick<Skill, "damage" | "kind">
): ElementKey {
  return skill.damage?.damageType ?? KIND_ELEMENT_KEY[skill.kind]
}

const KIND_ELEMENT_KEY: Record<SkillKind, ElementKey> = {
  attack: "special",
  ailment: "ailment",
  passive: "passive",
  heal: "heal",
  support: "support",
}

/**
 * Literal class strings per hue — written out (not template-composed) so
 * Tailwind's static extraction sees every class. `hueVar` is the exception: a
 * raw CSS variable (`var(--color-<hue>-400)`), not a class, so it's composed
 * from the hue name — nothing for Tailwind to extract.
 */
function tone(hue: string): ElementTone {
  const map: Record<string, Omit<ElementTone, "hueVar">> = {
    mauve: {
      text: "text-mauve-300",
      chip: "border-mauve-400/40 bg-mauve-400/10 text-mauve-200",
      headerRow: "bg-mauve-400/10 text-mauve-400",
    },
    taupe: {
      text: "text-taupe-300",
      chip: "border-taupe-400/40 bg-taupe-400/10 text-taupe-200",
      headerRow: "bg-taupe-400/10 text-taupe-400",
    },
    olive: {
      text: "text-olive-300",
      chip: "border-olive-400/40 bg-olive-400/10 text-olive-200",
      headerRow: "bg-olive-400/10 text-olive-400",
    },
    red: {
      text: "text-red-300",
      chip: "border-red-400/40 bg-red-400/10 text-red-200",
      headerRow: "bg-red-400/10 text-red-400",
    },
    blue: {
      text: "text-blue-300",
      chip: "border-blue-400/40 bg-blue-400/10 text-blue-200",
      headerRow: "bg-blue-400/10 text-blue-400",
    },
    green: {
      text: "text-green-300",
      chip: "border-green-400/40 bg-green-400/10 text-green-200",
      headerRow: "bg-green-400/10 text-green-400",
    },
    yellow: {
      text: "text-yellow-300",
      chip: "border-yellow-400/40 bg-yellow-400/10 text-yellow-200",
      headerRow: "bg-yellow-400/10 text-yellow-400",
    },
    cyan: {
      text: "text-cyan-300",
      chip: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
      headerRow: "bg-cyan-400/10 text-cyan-400",
    },
    purple: {
      text: "text-purple-300",
      chip: "border-purple-400/40 bg-purple-400/10 text-purple-200",
      headerRow: "bg-purple-400/10 text-purple-400",
    },
    zinc: {
      text: "text-zinc-200",
      chip: "border-zinc-300/40 bg-zinc-300/10 text-zinc-100",
      headerRow: "bg-zinc-300/10 text-zinc-100",
    },
    slate: {
      text: "text-slate-300",
      chip: "border-slate-400/40 bg-slate-400/10 text-slate-200",
      headerRow: "bg-slate-400/10 text-slate-400",
    },
    neutral: {
      text: "text-neutral-300",
      chip: "border-neutral-400/40 bg-neutral-400/10 text-neutral-200",
      headerRow: "bg-neutral-400/10 text-neutral-200",
    },
    violet: {
      text: "text-violet-300",
      chip: "border-violet-400/40 bg-violet-400/10 text-violet-200",
      headerRow: "bg-violet-400/10 text-violet-400",
    },
    emerald: {
      text: "text-emerald-300",
      chip: "border-emerald-400/40 bg-emerald-400/10 text-emerald-200",
      headerRow: "bg-emerald-400/10 text-emerald-400",
    },
    stone: {
      text: "text-stone-300",
      chip: "border-stone-400/40 bg-stone-400/10 text-stone-200",
      headerRow: "bg-stone-400/10 text-stone-400",
    },
  }
  return { ...map[hue]!, hueVar: `var(--color-${hue}-400)` }
}

export function elementTone(key: ElementKey): ElementTone {
  return TONES[key]
}

/** The element glyph (design handoff: Phosphor equivalents of the hue glyphs). */
export const ELEMENT_GLYPHS: Record<ElementKey, Icon> = {
  slash: SwordIcon,
  pierce: CrosshairIcon,
  strike: HandFistIcon,
  fire: FireIcon,
  ice: SnowflakeIcon,
  wind: WindIcon,
  elec: LightningIcon,
  soul: GhostIcon,
  mind: BrainIcon,
  light: SunIcon,
  dark: MoonIcon,
  almighty: SparkleIcon,
  special: AsteriskIcon,
  ailment: SkullIcon,
  passive: InfinityIcon,
  heal: HeartStraightIcon,
  support: ArrowFatUpIcon,
}
