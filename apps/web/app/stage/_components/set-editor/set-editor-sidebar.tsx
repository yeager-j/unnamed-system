"use client"

import {
  ArrowLeftIcon,
  GearSixIcon,
  PlusIcon,
} from "@phosphor-icons/react/dist/ssr"
import { nanoid } from "nanoid"
import Link from "next/link"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupAction,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@workspace/ui/components/sidebar"
import { cn } from "@workspace/ui/lib/utils"

import {
  SaveStatus,
  type StageSaveStatus,
} from "@/app/stage/_components/save-status"
import type {
  LintFinding,
  TemplateSetContent,
} from "@/domain/template-set/authoring"
import type { TemplateSetEvent } from "@/domain/template-set/commit/protocol"
import { stageSetsPath } from "@/lib/paths"

import type { SetEditorSelection } from "./selection"

/**
 * The Set editor's inset sidebar (the NPC-rail shape): the set header (back
 * link, autosaved name, save dot) over three groups — Templates, Tables, Set
 * settings. Items carry the editor's advisory signals inline: a warning dot
 * when a lint finding targets the item, a dimmed row + badge for tombstoned
 * templates, and a "Connector" badge on the designated empty-pool fallback.
 * The group `+` actions mint a new item and select it — no name prompt; the
 * detail form's name field is focused next (keys are opaque ids, names are
 * free to change).
 */
export function SetEditorSidebar({
  content,
  name,
  save,
  selection,
  findings,
  onSelect,
  onApplyEvent,
}: {
  content: TemplateSetContent
  name: {
    value: string
    onChange: (value: string) => void
    revert: () => void
    onFocusChange: (focused: boolean) => void
  }
  save: { status: StageSaveStatus; lastSavedAt: number | null }
  selection: SetEditorSelection
  findings: LintFinding[]
  onSelect: (selection: SetEditorSelection) => void
  onApplyEvent: (event: TemplateSetEvent) => void
}) {
  const flaggedTemplates = new Set(
    findings
      .filter((finding) => finding.target.kind === "template")
      .map((finding) => finding.target.key)
  )
  const flaggedTables = new Set(
    findings
      .filter((finding) => finding.target.kind === "table")
      .map((finding) => finding.target.key)
  )
  const hasSetFindings = findings.some(
    (finding) => finding.target.kind === "set"
  )

  function handleAddTemplate() {
    const key = nanoid(8)
    onApplyEvent({ kind: "addTemplate", key })
    onSelect({ kind: "template", key })
  }

  function handleAddTable() {
    const key = nanoid(8)
    onApplyEvent({ kind: "addTable", key })
    onSelect({ kind: "table", key })
  }

  return (
    <Sidebar variant="inset" className="top-14 h-[calc(100svh-3.5rem)]">
      <SidebarHeader className="gap-3 px-4 pt-5 pb-2">
        <Button
          variant="ghost"
          size="sm"
          className="self-start px-1 text-muted-foreground"
          render={<Link href={stageSetsPath()} />}
          nativeButton={false}
        >
          <ArrowLeftIcon />
          Template Sets
        </Button>
        <Input
          aria-label="Set name"
          value={name.value}
          maxLength={100}
          onChange={(event) => name.onChange(event.target.value)}
          onFocus={() => name.onFocusChange(true)}
          onBlur={() => name.onFocusChange(false)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              event.currentTarget.blur()
            } else if (event.key === "Escape") {
              event.preventDefault()
              name.revert()
              event.currentTarget.blur()
            }
          }}
          className="h-9 border-transparent bg-transparent px-1 font-display text-lg font-semibold shadow-none focus-visible:border-input"
        />
        <div className="px-1 text-xs text-muted-foreground">
          <SaveStatus save={save} />
        </div>
      </SidebarHeader>

      <SidebarContent>
        {/* The nav landmark scopes "which button named X" — the lint rail
            renders finding buttons carrying the same template names. */}
        <nav aria-label="Set contents">
          <SidebarGroup>
            <SidebarGroupLabel>Templates</SidebarGroupLabel>
            <SidebarGroupAction
              title="Add template"
              onClick={handleAddTemplate}
            >
              <PlusIcon /> <span className="sr-only">Add template</span>
            </SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu>
                {content.templateOrder.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    No templates yet.
                  </p>
                ) : (
                  content.templateOrder.map((key) => {
                    const template = content.templates[key]
                    if (!template) return null
                    const isActive =
                      selection.kind === "template" && selection.key === key
                    return (
                      <SidebarMenuItem key={key}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => onSelect({ kind: "template", key })}
                          className={cn(template.tombstoned && "opacity-50")}
                        >
                          <span className="truncate">
                            {template.name.trim() || "Untitled template"}
                          </span>
                          {template.tombstoned ? (
                            <Badge
                              variant="outline"
                              className="ml-auto shrink-0 text-[10px]"
                            >
                              Tombstoned
                            </Badge>
                          ) : content.connectorTemplateKey === key ? (
                            <Badge
                              variant="secondary"
                              className="ml-auto shrink-0 text-[10px]"
                            >
                              Connector
                            </Badge>
                          ) : null}
                          {flaggedTemplates.has(key) && <WarningDot />}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Tables</SidebarGroupLabel>
            <SidebarGroupAction title="Add table" onClick={handleAddTable}>
              <PlusIcon /> <span className="sr-only">Add table</span>
            </SidebarGroupAction>
            <SidebarGroupContent>
              <SidebarMenu>
                {content.tableOrder.length === 0 ? (
                  <p className="px-2 py-1.5 text-xs text-muted-foreground">
                    No tables yet.
                  </p>
                ) : (
                  content.tableOrder.map((key) => {
                    const table = content.tables[key]
                    if (!table) return null
                    const isActive =
                      selection.kind === "table" && selection.key === key
                    return (
                      <SidebarMenuItem key={key}>
                        <SidebarMenuButton
                          isActive={isActive}
                          onClick={() => onSelect({ kind: "table", key })}
                        >
                          <span className="truncate">
                            {table.name.trim() || "Untitled table"}
                          </span>
                          {flaggedTables.has(key) && <WarningDot />}
                        </SidebarMenuButton>
                      </SidebarMenuItem>
                    )
                  })
                )}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>

          <SidebarGroup>
            <SidebarGroupLabel>Set</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    isActive={selection.kind === "settings"}
                    onClick={() => onSelect({ kind: "settings" })}
                  >
                    <GearSixIcon />
                    <span>Set settings</span>
                    {hasSetFindings && <WarningDot />}
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </nav>
      </SidebarContent>
    </Sidebar>
  )
}

/** The advisory marker on a rail item a lint finding targets. */
function WarningDot() {
  return (
    <span
      className="ml-auto size-1.5 shrink-0 rounded-full bg-amber-500"
      aria-label="Has lint findings"
    />
  )
}
