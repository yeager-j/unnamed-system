import type { EnemyDefinition } from "../../schema"
import { bandit } from "./bandit"
import { banditCaptain } from "./bandit-captain"
import { bugbear } from "./bugbear"
import { goblin } from "./goblin"
import { goblinLeader } from "./goblin-leader"
import { goblinWarrior } from "./goblin-warrior"

export const HUMANOID_ENEMIES = {
  goblin,
  "goblin-warrior": goblinWarrior,
  "goblin-leader": goblinLeader,
  bandit,
  "bandit-captain": banditCaptain,
  bugbear,
} as const satisfies Record<string, EnemyDefinition>
