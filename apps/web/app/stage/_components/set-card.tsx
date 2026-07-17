import Link from "next/link"

import type { TemplateSetRow } from "@/lib/db/schema/template-set"
import { stageSetPath } from "@/lib/paths"

/** Counts as "3 templates · 2 tables", eliding a zero side ("Empty set" when both). */
function contentSummary(set: TemplateSetRow): string {
  const templates = set.content.templateOrder.length
  const tables = set.content.tableOrder.length
  const parts = [
    templates > 0 &&
      (templates === 1 ? "1 template" : `${templates} templates`),
    tables > 0 && (tables === 1 ? "1 table" : `${tables} tables`),
  ].filter((part): part is string => typeof part === "string")

  return parts.length > 0 ? parts.join(" · ") : "Empty set"
}

/**
 * A Template Set in the Sets list (UNN-588) — name + template/table counts,
 * linking to its editor (`/stage/sets/{shortId}`). Mirrors {@link import("./map-card").MapCard}.
 */
export function SetCard({ set }: { set: TemplateSetRow }) {
  return (
    <Link
      href={stageSetPath(set.shortId)}
      className="flex flex-col gap-1 border p-4 transition-colors hover:bg-muted/50"
    >
      <span className="font-medium">{set.name}</span>
      <span className="text-sm text-muted-foreground">
        {contentSummary(set)}
      </span>
    </Link>
  )
}
