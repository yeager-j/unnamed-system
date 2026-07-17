"use client"

import { useRouter, useSearchParams } from "next/navigation"
import { useCallback, useMemo, useState } from "react"

import { SidebarInset, SidebarProvider } from "@workspace/ui/components/sidebar"

import { useTemplateSetAutoSave } from "@/app/stage/_hooks/use-template-set-autosave"
import {
  lintTemplateSet,
  type TemplateSetContent,
} from "@/domain/template-set/authoring"
import { enemyKeys, itemKeys } from "@/domain/template-set/catalog-options"
import type { TemplateSetRow } from "@/lib/db/schema/template-set"
import { stageSetPath } from "@/lib/paths"

import { LintRail } from "./lint-rail"
import {
  selectionFromParam,
  selectionToParam,
  type SetEditorSelection,
} from "./selection"
import { SetEditorSidebar } from "./set-editor-sidebar"
import { SetSettingsForm } from "./set-settings-form"
import { TableForm } from "./table-form"
import { TemplateForm } from "./template-form"

/** A Map the portal picker can bind (`{ id, name }`, server-shaped). */
export interface PortalMapOption {
  id: string
  name: string
}

/**
 * The Template Set editor (UNN-588 P1b) — master-detail on the NPC-rail shape:
 * an inset sidebar lists Templates / Tables / Set settings, the selected item's
 * form renders in the inset, and a persistent lint rail advises on the right.
 *
 * One client tree, mounted once: `content` is the single source of truth for
 * the whole blob, every edit flows `content → setContent → saveContent`
 * (whole-blob autosave through the shared version token), and selection rides
 * the `?item=` search param so items are URL-addressable without remounting
 * the editor (see `selection.ts`). Lint re-runs as a pure `useMemo` on every
 * content change — advisory only, never save-blocking.
 */
export function SetEditor({
  set,
  mapOptions,
}: {
  set: TemplateSetRow
  mapOptions: PortalMapOption[]
}) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [content, setContent] = useState<TemplateSetContent>(set.content)

  const { name, saveContent, save } = useTemplateSetAutoSave({
    templateSetId: set.id,
    serverName: set.name,
    serverVersion: set.version,
  })

  const selection = selectionFromParam(searchParams.get("item"))

  const select = useCallback(
    (next: SetEditorSelection) => {
      const param = selectionToParam(next)
      const target = param
        ? `${stageSetPath(set.shortId)}?item=${encodeURIComponent(param)}`
        : stageSetPath(set.shortId)
      router.replace(target, { scroll: false })
    },
    [router, set.shortId]
  )

  const applyContent = useCallback(
    (next: TemplateSetContent) => {
      setContent(next)
      saveContent(next)
    },
    [saveContent]
  )

  const vocab = useMemo(
    () => ({
      enemyKeys,
      itemKeys,
      mapIds: new Set(mapOptions.map((option) => option.id)),
    }),
    [mapOptions]
  )
  const findings = useMemo(
    () => lintTemplateSet(content, vocab),
    [content, vocab]
  )

  const selectedTemplate =
    selection.kind === "template"
      ? (content.templates[selection.key] ?? null)
      : null
  const selectedTable =
    selection.kind === "table" ? (content.tables[selection.key] ?? null) : null

  return (
    // Fixed height (not min-h): the editor is viewport-locked like the Map
    // canvas — only the form column scrolls, never the document.
    <SidebarProvider
      open
      onOpenChange={() => {}}
      className="h-[calc(100svh-3.5rem)] min-h-0 flex-1 overflow-hidden"
    >
      <SetEditorSidebar
        content={content}
        name={name}
        save={save}
        selection={selection}
        findings={findings}
        onSelect={select}
        onApplyContent={applyContent}
      />

      <SidebarInset className="min-w-0">
        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto">
            <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 p-6">
              {selection.kind === "settings" ? (
                <SetSettingsForm
                  set={set}
                  setName={name.value}
                  content={content}
                  onApplyContent={applyContent}
                />
              ) : selectedTemplate ? (
                <TemplateForm
                  key={selectedTemplate.key}
                  template={selectedTemplate}
                  content={content}
                  mapOptions={mapOptions}
                  onApplyContent={applyContent}
                  onSelect={select}
                />
              ) : selectedTable ? (
                <TableForm
                  key={selectedTable.key}
                  table={selectedTable}
                  content={content}
                  onApplyContent={applyContent}
                  onSelect={select}
                />
              ) : (
                <MissingItem onSelect={select} />
              )}
            </div>
          </main>

          <LintRail findings={findings} content={content} onSelect={select} />
        </div>
      </SidebarInset>
    </SidebarProvider>
  )
}

/** A stale `?item=` deep link (the item was deleted, or the URL was hand-made):
 *  say so instead of rendering a blank inset. */
function MissingItem({
  onSelect,
}: {
  onSelect: (selection: SetEditorSelection) => void
}) {
  return (
    <div className="flex flex-col items-start gap-2 text-sm text-muted-foreground">
      <p>That template or table isn&apos;t in this set anymore.</p>
      <button
        type="button"
        className="underline underline-offset-2 hover:text-foreground"
        onClick={() => onSelect({ kind: "settings" })}
      >
        Back to set settings
      </button>
    </div>
  )
}
