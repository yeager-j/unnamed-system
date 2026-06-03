import { evilTouch } from "./ailment/evil-touch"
import { makajam } from "./ailment/makajam"
import { pulpina } from "./ailment/pulpina"
import { doorToHades } from "./dark/door-to-hades"
import { eiha } from "./dark/eiha"
import { stormThrust } from "./elec/storm-thrust"
import { zio } from "./elec/zio"
import { agi } from "./fire/agi"
import { amritaDrop } from "./heal/amrita-drop"
import { dia } from "./heal/dia"
import { media } from "./heal/media"
import { bufu } from "./ice/bufu"
import { divineJudgment } from "./light/divine-judgment"
import { kouha } from "./light/kouha"
import { ailmentBoost } from "./passive/ailment-boost"
import { autoRakukaja } from "./passive/auto-rakukaja"
import { healersInsight } from "./passive/healers-insight"
import { magicCircle } from "./passive/magic-circle"
import { slashBoost } from "./passive/slash-boost"
import { hammerOfJustice } from "./pierce/hammer-of-justice"
import { skewer } from "./pierce/skewer"
import { psi } from "./psy/psi"
import type { Skill } from "./schema"
import { cleave } from "./slash/cleave"
import { criticalStrike } from "./slash/critical-strike"
import { peerlessStonecleaver } from "./slash/peerless-stonecleaver"
import { tempestSlash } from "./slash/tempest-slash"
import { elementalApocalypse } from "./special/elemental-apocalypse"
import { shieldArts } from "./strike/shield-arts"
import { knightsProclamation } from "./support/knights-proclamation"
import { garu } from "./wind/garu"
import { windblade } from "./wind/windblade"

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
  psi,
  "magic-circle": magicCircle,
  "elemental-apocalypse": elementalApocalypse,
  kouha,
  eiha,
  dia,
  media,
  "amrita-drop": amritaDrop,
  "healers-insight": healersInsight,
  "divine-judgment": divineJudgment,
  "evil-touch": evilTouch,
  pulpina,
  makajam,
  "ailment-boost": ailmentBoost,
  "door-to-hades": doorToHades,
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
