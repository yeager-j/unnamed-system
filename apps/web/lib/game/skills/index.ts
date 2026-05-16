import { skillSchema, type Skill } from "./schema"
import { agi } from "./agi"
import { amritaDrop } from "./amrita-drop"
import { autoRakukaja } from "./auto-rakukaja"
import { bufu } from "./bufu"
import { cleave } from "./cleave"
import { criticalStrike } from "./critical-strike"
import { dia } from "./dia"
import { divineJudgment } from "./divine-judgment"
import { elementalApocalypse } from "./elemental-apocalypse"
import { garu } from "./garu"
import { hammerOfJustice } from "./hammer-of-justice"
import { healersInsight } from "./healers-insight"
import { knightsProclamation } from "./knights-proclamation"
import { kouha } from "./kouha"
import { magicCircle } from "./magic-circle"
import { media } from "./media"
import { peerlessStonecleaver } from "./peerless-stonecleaver"
import { shieldArts } from "./shield-arts"
import { skewer } from "./skewer"
import { slashBoost } from "./slash-boost"
import { stormThrust } from "./storm-thrust"
import { tempestSlash } from "./tempest-slash"
import { windblade } from "./windblade"
import { zio } from "./zio"

function validate(skill: Skill): Skill {
  skillSchema.parse(skill)
  return skill
}

const SKILLS_BY_KEY = {
  cleave: validate(cleave),
  windblade: validate(windblade),
  "tempest-slash": validate(tempestSlash),
  "critical-strike": validate(criticalStrike),
  "slash-boost": validate(slashBoost),
  "peerless-stonecleaver": validate(peerlessStonecleaver),
  skewer: validate(skewer),
  "knights-proclamation": validate(knightsProclamation),
  "storm-thrust": validate(stormThrust),
  "shield-arts": validate(shieldArts),
  "auto-rakukaja": validate(autoRakukaja),
  "hammer-of-justice": validate(hammerOfJustice),
  agi: validate(agi),
  bufu: validate(bufu),
  zio: validate(zio),
  garu: validate(garu),
  "magic-circle": validate(magicCircle),
  "elemental-apocalypse": validate(elementalApocalypse),
  kouha: validate(kouha),
  dia: validate(dia),
  media: validate(media),
  "amrita-drop": validate(amritaDrop),
  "healers-insight": validate(healersInsight),
  "divine-judgment": validate(divineJudgment),
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

/** Returns every hardcoded Skill. */
export function getAllSkills(): readonly Skill[] {
  return SKILLS
}
