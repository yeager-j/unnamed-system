import { z } from "zod/v4"

import type { EntityWriteRefusal } from "./writers"

/** Wire codec for the refusal vocabulary shared by entity-writing roots. */
export const entityWriteRefusalSchema = z.enum([
  "capability-missing",
  "no-prisma-charges",
  "no-transitions",
  "allocation-cap-exceeded",
  "entry-not-found",
  "not-unlocked",
  "insufficient-skill-dice",
  "insufficient-hit-dice",
  "invalid-input",
  "insufficient-victories",
  "max-level",
  "log-full",
  "log-not-full",
  "virtue-not-eligible",
  "rank-capped",
  "no-saved-ranks",
  "prerequisites-not-met",
  "item-not-found",
  "catalog-item-unknown",
  "invalid-quantity",
  "duplicate-item-id",
  "entity-load-failed",
]) satisfies z.ZodType<EntityWriteRefusal | "entity-load-failed">
