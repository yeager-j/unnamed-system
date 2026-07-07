import {
  AsteriskIcon,
  BrainIcon,
  CrosshairIcon,
  FlameIcon,
  GhostIcon,
  HandFistIcon,
  HeartStraightIcon,
  LightningIcon,
  MoonIcon,
  SnowflakeIcon,
  SparkleIcon,
  SunIcon,
  SwordIcon,
  WindIcon,
  type Icon,
} from "@phosphor-icons/react"

import type { DamageType } from "@workspace/game-v2/kernel/vocab"

/**
 * The Skill-card element system (design handoff "Element color system",
 * implemented on the Tailwind palette per the S2a design call — no one-off
 * oklch values). Hues follow the established damage-type badge language
 * (`shared/damage-type-badge.tsx`): physicals earthy (mauve/mist/olive),
 * magicals their intuitive element color. Each tone is a set of literal class
 * strings (Tailwind statically extracts them) tuned for the dark theme:
 * `chip` for small bordered tokens, `text` for the hue's accent text, and
 * `banner`/`headerRow` for the card's tinted regions.
 *
 * `"support"` is the non-damage fallback key — heal/support/passive cards
 * carry the cool support tone instead of an element.
 */
export type ElementKey = DamageType | "special" | "support"

export interface ElementTone {
  text: string
  chip: string
  banner: string
  headerRow: string
}

const TONES: Record<ElementKey, ElementTone> = {
  slash: tone("mauve"),
  pierce: tone("mist"),
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
  support: tone("indigo"),
}

/**
 * Literal class strings per hue — written out (not template-composed) so
 * Tailwind's static extraction sees every class.
 */
function tone(hue: string): ElementTone {
  const map: Record<string, ElementTone> = {
    mauve: {
      text: "text-mauve-300",
      chip: "border-mauve-400/40 bg-mauve-400/10 text-mauve-200",
      banner: "from-mauve-400/25",
      headerRow: "bg-mauve-400/15 text-mauve-200",
    },
    mist: {
      text: "text-mist-300",
      chip: "border-mist-400/40 bg-mist-400/10 text-mist-200",
      banner: "from-mist-400/25",
      headerRow: "bg-mist-400/15 text-mist-200",
    },
    olive: {
      text: "text-olive-300",
      chip: "border-olive-400/40 bg-olive-400/10 text-olive-200",
      banner: "from-olive-400/25",
      headerRow: "bg-olive-400/15 text-olive-200",
    },
    red: {
      text: "text-red-300",
      chip: "border-red-400/40 bg-red-400/10 text-red-200",
      banner: "from-red-400/25",
      headerRow: "bg-red-400/15 text-red-200",
    },
    blue: {
      text: "text-blue-300",
      chip: "border-blue-400/40 bg-blue-400/10 text-blue-200",
      banner: "from-blue-400/25",
      headerRow: "bg-blue-400/15 text-blue-200",
    },
    green: {
      text: "text-green-300",
      chip: "border-green-400/40 bg-green-400/10 text-green-200",
      banner: "from-green-400/25",
      headerRow: "bg-green-400/15 text-green-200",
    },
    yellow: {
      text: "text-yellow-300",
      chip: "border-yellow-400/40 bg-yellow-400/10 text-yellow-200",
      banner: "from-yellow-400/25",
      headerRow: "bg-yellow-400/15 text-yellow-200",
    },
    cyan: {
      text: "text-cyan-300",
      chip: "border-cyan-400/40 bg-cyan-400/10 text-cyan-200",
      banner: "from-cyan-400/25",
      headerRow: "bg-cyan-400/15 text-cyan-200",
    },
    purple: {
      text: "text-purple-300",
      chip: "border-purple-400/40 bg-purple-400/10 text-purple-200",
      banner: "from-purple-400/25",
      headerRow: "bg-purple-400/15 text-purple-200",
    },
    zinc: {
      text: "text-zinc-200",
      chip: "border-zinc-300/40 bg-zinc-300/10 text-zinc-100",
      banner: "from-zinc-300/25",
      headerRow: "bg-zinc-300/15 text-zinc-100",
    },
    slate: {
      text: "text-slate-300",
      chip: "border-slate-400/40 bg-slate-400/10 text-slate-200",
      banner: "from-slate-400/25",
      headerRow: "bg-slate-400/15 text-slate-200",
    },
    neutral: {
      text: "text-neutral-300",
      chip: "border-neutral-400/40 bg-neutral-400/10 text-neutral-200",
      banner: "from-neutral-400/25",
      headerRow: "bg-neutral-400/15 text-neutral-200",
    },
    indigo: {
      text: "text-indigo-300",
      chip: "border-indigo-400/40 bg-indigo-400/10 text-indigo-200",
      banner: "from-indigo-400/25",
      headerRow: "bg-indigo-400/15 text-indigo-200",
    },
  }
  return map[hue]!
}

export function elementTone(key: ElementKey): ElementTone {
  return TONES[key]
}

/** The element glyph (design handoff: Phosphor equivalents of the hue glyphs). */
export const ELEMENT_GLYPHS: Record<ElementKey, Icon> = {
  slash: SwordIcon,
  pierce: CrosshairIcon,
  strike: HandFistIcon,
  fire: FlameIcon,
  ice: SnowflakeIcon,
  wind: WindIcon,
  elec: LightningIcon,
  soul: GhostIcon,
  mind: BrainIcon,
  light: SunIcon,
  dark: MoonIcon,
  almighty: SparkleIcon,
  special: AsteriskIcon,
  support: HeartStraightIcon,
}
