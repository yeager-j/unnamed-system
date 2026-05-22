import { agi } from "./agi"
import { ailmentBoost } from "./ailment-boost"
import { amritaDrop } from "./amrita-drop"
import { autoRakukaja } from "./auto-rakukaja"
import { bufu } from "./bufu"
import { cleave } from "./cleave"
import { criticalStrike } from "./critical-strike"
import { dia } from "./dia"
import { divineJudgment } from "./divine-judgment"
import { elementalApocalypse } from "./elemental-apocalypse"
import { evilTouch } from "./evil-touch"
import { garu } from "./garu"
import { hammerOfJustice } from "./hammer-of-justice"
import { healersInsight } from "./healers-insight"
import { knightsProclamation } from "./knights-proclamation"
import { kouha } from "./kouha"
import { magicCircle } from "./magic-circle"
import { media } from "./media"
import { peerlessStonecleaver } from "./peerless-stonecleaver"
import type { Skill } from "./schema"
import { shieldArts } from "./shield-arts"
import { skewer } from "./skewer"
import { slashBoost } from "./slash-boost"
import { stormThrust } from "./storm-thrust"
import { tempestSlash } from "./tempest-slash"
import { windblade } from "./windblade"
import { zio } from "./zio"

const SKILLS_BY_KEY = {
  cleave,
  windblade,
  "tempest-slash": tempestSlash,
  "critical-strike": criticalStrike,
  "slash-boost": slashBoost,
  "peerless-stonecleaver": peerlessStonecleaver,
  skewer,
  "knights-proclamation": knightsProclamation,
  "storm-thrust": stormThrust,
  "shield-arts": shieldArts,
  "auto-rakukaja": autoRakukaja,
  "hammer-of-justice": hammerOfJustice,
  agi,
  bufu,
  zio,
  garu,
  "magic-circle": magicCircle,
  "elemental-apocalypse": elementalApocalypse,
  kouha,
  dia,
  media,
  "amrita-drop": amritaDrop,
  "healers-insight": healersInsight,
  "divine-judgment": divineJudgment,
  "evil-touch": evilTouch,
  "ailment-boost": ailmentBoost,
} as const satisfies Record<string, Skill>

export type SkillKey = keyof typeof SKILLS_BY_KEY

export const SKILLS: readonly Skill[] = Object.values(SKILLS_BY_KEY)

/**
 * Looks up a hardcoded Skill by its slug key. Returns `undefined` when no
 * Skill matches.
 */
export function getSkill(key: string): Skill | undefined {
  return (SKILLS_BY_KEY as Record<string, Skill>)[key]
}
