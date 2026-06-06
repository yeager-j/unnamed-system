import { bandit } from "@workspace/game/data/enemies/5e/humanoid/bandit"
import { banditCaptain } from "@workspace/game/data/enemies/5e/humanoid/bandit-captain"
import { bugbear } from "@workspace/game/data/enemies/5e/humanoid/bugbear"
import { goblin } from "@workspace/game/data/enemies/5e/humanoid/goblin"
import { goblinLeader } from "@workspace/game/data/enemies/5e/humanoid/goblin-leader"
import { goblinWarrior } from "@workspace/game/data/enemies/5e/humanoid/goblin-warrior"
import type { EnemyDefinition } from "@workspace/game/foundation/enemies/schema"

export const HUMANOID_ENEMIES = {
  goblin,
  "goblin-warrior": goblinWarrior,
  "goblin-leader": goblinLeader,
  bandit,
  "bandit-captain": banditCaptain,
  bugbear,
} as const satisfies Record<string, EnemyDefinition>
