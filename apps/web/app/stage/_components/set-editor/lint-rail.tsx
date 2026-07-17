"use client"

import {
  CaretDoubleRightIcon,
  CheckCircleIcon,
  WarningIcon,
} from "@phosphor-icons/react/dist/ssr"
import { useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { Separator } from "@workspace/ui/components/separator"

import type {
  LintFinding,
  LintRule,
  TemplateSetContent,
} from "@/domain/template-set/authoring"

import { selectionFromFinding, type SetEditorSelection } from "./selection"

/** Display copy per rule — the rail groups findings under these headings. */
const RULE_HEADINGS: Record<LintRule, string> = {
  "unmintable-template": "Unmintable templates",
  "missing-connector": "No connector designated",
  "non-universal-connector": "Connector isn't universal",
  "dangling-table-ref": "Dangling table references",
  "unresolvable-enemy-ref": "Unknown enemies",
  "unresolvable-item-ref": "Unknown items",
  "unresolvable-portal-ref": "Unresolvable portals",
  "site-missing-declaration-defaults": "Sites without declaration defaults",
}

/** Stable heading order (object key order is fine here — this is a closed
 *  in-code table, not a persisted record). */
const RULE_ORDER = Object.keys(RULE_HEADINGS) as LintRule[]

/**
 * The floating advisory card (D9), overlaid top-right in the editor inset
 * (CanvasPanel's visual language; the host owns the absolute positioning):
 * `lintTemplateSet` re-runs on every content change and renders here — grouped
 * by rule, each finding a button that selects the offending item. **Advisory
 * only, never save-blocking** — the autosave has already persisted whatever
 * the findings describe; expedition start (P2) is the gate that refuses on
 * errors. Collapses to a status chip, open by default.
 */
export function LintRail({
  findings,
  content,
  onSelect,
}: {
  findings: LintFinding[]
  content: TemplateSetContent
  onSelect: (selection: SetEditorSelection) => void
}) {
  const [open, setOpen] = useState(true)

  if (!open) {
    return (
      <div className="rounded-xl border bg-popover p-0.5 shadow-lg">
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={`Open lint panel (${findings.length} findings)`}
          onClick={() => setOpen(true)}
        >
          {findings.length > 0 ? (
            <span className="relative">
              <WarningIcon className="text-amber-500" />
              <span className="absolute -top-1.5 -right-2 rounded-full bg-amber-500 px-1 text-[10px] leading-3 font-medium text-background tabular-nums">
                {findings.length}
              </span>
            </span>
          ) : (
            <CheckCircleIcon className="text-emerald-500" />
          )}
        </Button>
      </div>
    )
  }

  return (
    <aside
      aria-label="Set lint"
      className="flex max-h-full w-72 max-w-[calc(100vw-2rem)] flex-col gap-3 overflow-y-auto rounded-xl border bg-popover p-4 shadow-lg"
    >
      <div className="flex items-center justify-between gap-2">
        <h3 className="text-sm font-medium">Lint</h3>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label="Collapse lint panel"
          onClick={() => setOpen(false)}
        >
          <CaretDoubleRightIcon />
        </Button>
      </div>

      {findings.length === 0 ? (
        <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
          <CheckCircleIcon className="size-4 shrink-0 text-emerald-500" />
          No findings — the set generates cleanly.
        </p>
      ) : (
        <div className="flex flex-col gap-4">
          <p className="text-xs text-muted-foreground">
            Advisory — saves always land. Expedition start refuses on errors.
          </p>
          {RULE_ORDER.map((rule) => {
            const group = findings.filter((finding) => finding.rule === rule)
            if (group.length === 0) return null
            return (
              <section key={rule} className="flex flex-col gap-1.5">
                <h4 className="flex items-center gap-1.5 text-xs font-medium tracking-wide uppercase">
                  <WarningIcon className="size-3.5 shrink-0 text-amber-500" />
                  {RULE_HEADINGS[rule]}
                </h4>
                <ul className="flex flex-col gap-1">
                  {group.map((finding, index) => (
                    <li key={index}>
                      <button
                        type="button"
                        className="w-full rounded-md px-2 py-1.5 text-left text-xs text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                        onClick={() =>
                          onSelect(selectionFromFinding(finding.target))
                        }
                      >
                        {finding.message}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
      )}

      <Separator className="mt-auto" />
      <p className="text-xs text-muted-foreground tabular-nums">
        {content.templateOrder.length}{" "}
        {content.templateOrder.length === 1 ? "template" : "templates"} ·{" "}
        {content.tableOrder.length}{" "}
        {content.tableOrder.length === 1 ? "table" : "tables"}
      </p>
    </aside>
  )
}
