import {
  CompassIcon,
  LockKeyOpenIcon,
  PathIcon,
  SparkleIcon,
  type Icon,
} from "@phosphor-icons/react"

import type { RecommendationReasonIconKey } from "./labels"

/**
 * Resolves a {@link RecommendationReasonIconKey} to its Phosphor icon
 * component. Mirrors `LINEAGE_ICONS` in [lib/ui/lineage-icons.ts](./lineage-icons.ts):
 * kept apart from `labels.ts` so the icon library stays out of that server-safe
 * module, and only the (client) recommendation slots import this.
 */
export const RECOMMENDATION_REASON_ICONS: Record<
  RecommendationReasonIconKey,
  Icon
> = {
  compass: CompassIcon,
  "lock-key-open": LockKeyOpenIcon,
  path: PathIcon,
  sparkle: SparkleIcon,
}
