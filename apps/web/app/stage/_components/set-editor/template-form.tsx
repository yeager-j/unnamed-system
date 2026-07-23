"use client"

import { PlusIcon, XIcon } from "@phosphor-icons/react/dist/ssr"
import { useMemo } from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import { DataSelect } from "@workspace/ui/components/data-select"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Label } from "@workspace/ui/components/label"
import { Separator } from "@workspace/ui/components/separator"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"

import type {
  TemplateSetContent,
  ZoneTemplate,
} from "@/domain/template-set/authoring"
import type { TemplateSetEvent } from "@/domain/template-set/commit/protocol"
import { referencedTemplateKeys } from "@/domain/template-set/edit"
import type { TemplatePatch } from "@/domain/template-set/events"

import type { SetEditorSelection } from "./selection"
import type { PortalMapOption } from "./set-editor"
import { TokenCombobox } from "./token-combobox"

/**
 * One zone template's form — "a small form, not a canvas" (PRD). Every change
 * emits a target-scoped `updateTemplate` intent; there is no Save button. The
 * delete intent tombstones instead of removing when the template is referenced
 * (in P1: designated as the connector) — the ticket's liveness guard.
 */
export function TemplateForm({
  template,
  content,
  mapOptions,
  onApplyEvent,
  onSelect,
}: {
  template: ZoneTemplate
  content: TemplateSetContent
  mapOptions: PortalMapOption[]
  onApplyEvent: (event: TemplateSetEvent) => void
  onSelect: (selection: SetEditorSelection) => void
}) {
  const key = template.key

  /** Every token used in any template's tags or accepts — the set's adjacency
   *  vocabulary, offered as suggestions in both token editors. */
  const tokenVocabulary = useMemo(() => {
    const tokens = new Set<string>()
    for (const other of Object.values(content.templates)) {
      for (const tag of other.tags) tokens.add(tag)
      for (const accept of other.accepts) tokens.add(accept)
    }
    return [...tokens].sort()
  }, [content.templates])

  function patch(update: TemplatePatch) {
    onApplyEvent({ kind: "updateTemplate", key, patch: update })
  }

  const isConnector = content.connectorTemplateKey === key
  const tableOptions = content.tableOrder
    .map((tableKey) => ({ tableKey, table: content.tables[tableKey] }))
    .filter((option) => option.table !== undefined)

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-center gap-2">
        <h2 className="font-display text-2xl font-semibold">
          {template.name.trim() || "Untitled template"}
        </h2>
        {template.tombstoned && <Badge variant="outline">Tombstoned</Badge>}
        {isConnector && <Badge variant="secondary">Connector</Badge>}
      </header>

      <Field>
        <FieldLabel htmlFor="template-name">Name</FieldLabel>
        <Input
          id="template-name"
          value={template.name}
          maxLength={100}
          autoFocus={template.name === "New template"}
          onChange={(event) => patch({ name: event.target.value })}
        />
        <FieldDescription>
          Stamped onto minted zones — repeat mints auto-disambiguate
          (&quot;Hallway&quot;, &quot;Hallway 2&quot;).
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="template-description">Description</FieldLabel>
        <Textarea
          id="template-description"
          value={template.description}
          rows={3}
          onChange={(event) => patch({ description: event.target.value })}
        />
        <FieldDescription>
          Player-facing text shown when a minted zone is revealed.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="template-dm-notes">DM notes</FieldLabel>
        <Textarea
          id="template-dm-notes"
          value={template.dmNotes}
          rows={2}
          onChange={(event) => patch({ dmNotes: event.target.value })}
        />
      </Field>

      <Separator />

      <Field>
        <FieldLabel htmlFor="template-tags">Tags — what this is</FieldLabel>
        <TokenCombobox
          id="template-tags"
          value={template.tags}
          suggestions={tokenVocabulary}
          placeholder="street, plaza, interior…"
          onChange={(tags) => patch({ tags })}
        />
        <FieldDescription>
          Checked against neighbours&apos; accepts when the roll considers this
          template.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel htmlFor="template-accepts">
          Accepts — what may sit adjacent
        </FieldLabel>
        <TokenCombobox
          id="template-accepts"
          value={template.accepts}
          suggestions={tokenVocabulary}
          placeholder="street, alley…"
          onChange={(accepts) => patch({ accepts })}
        />
        <FieldDescription>
          Adjacency is legal only when both sides accept each other&apos;s tags
          (checked two-way).
        </FieldDescription>
      </Field>

      <div className="flex flex-col gap-2">
        <Label>Exits</Label>
        {template.exits.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No exits — a zone minted from this template is a dead end beyond its
            entrance.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {template.exits.map((exit, index) => (
              <li
                key={index}
                className="flex items-center justify-between gap-3 rounded-md border px-3 py-1.5 text-sm"
              >
                <span>Exit {index + 1}</span>
                <span className="flex items-center gap-3">
                  <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    Optional
                    <Switch
                      checked={exit.optional}
                      onCheckedChange={(optional) =>
                        patch({
                          exits: template.exits.map((e, i) =>
                            i === index ? { ...e, optional } : e
                          ),
                        })
                      }
                    />
                  </label>
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    aria-label={`Remove exit ${index + 1}`}
                    onClick={() =>
                      patch({
                        exits: template.exits.filter((_, i) => i !== index),
                      })
                    }
                  >
                    <XIcon />
                  </Button>
                </span>
              </li>
            ))}
          </ul>
        )}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          onClick={() =>
            patch({ exits: [...template.exits, { optional: false }] })
          }
        >
          <PlusIcon /> Add exit
        </Button>
        <p className="text-xs text-muted-foreground">
          Optional exits may be culled at mint for variable connectivity.
        </p>
      </div>

      <Separator />

      <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
        <Field>
          <FieldLabel htmlFor="template-weight">Weight</FieldLabel>
          <Input
            id="template-weight"
            type="number"
            min={0}
            value={template.weight}
            onChange={(event) => {
              const weight = Number(event.target.value)
              if (!Number.isNaN(weight)) patch({ weight: Math.max(0, weight) })
            }}
            className="w-28 tabular-nums"
          />
          <FieldDescription>
            0 = never rolled randomly (a site-by-choice profile).
          </FieldDescription>
        </Field>

        <Field>
          <FieldLabel htmlFor="template-unique">Unique</FieldLabel>
          <div className="flex h-9 items-center">
            <Switch
              id="template-unique"
              checked={template.unique}
              onCheckedChange={(unique) => patch({ unique })}
            />
          </div>
          <FieldDescription>At most one mint per expedition.</FieldDescription>
        </Field>
      </div>

      <Field>
        <FieldLabel>Portal</FieldLabel>
        <DataSelect
          className="w-full max-w-sm"
          placeholder="Missing map"
          nullOption={{ label: "Not a portal" }}
          options={mapOptions}
          optionValue={(option) => option.id}
          optionLabel={(option) => option.name}
          value={template.portalMapId ?? ""}
          onValueChange={(value) => patch({ portalMapId: value || null })}
        />
        <FieldDescription>
          A portal template grafts the targeted static Map when the party enters
          (P6 wires the traversal).
        </FieldDescription>
      </Field>

      <SiteSection template={template} onPatch={patch} />

      <Separator />

      <div className="flex flex-col gap-2">
        <Label>Content rolls</Label>
        {template.contentRolls.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No content rolls — minted zones start empty.
          </p>
        ) : (
          <ul className="flex flex-col gap-1.5">
            {template.contentRolls.map((roll, index) => {
              return (
                <li
                  key={index}
                  className="flex flex-wrap items-center gap-2 rounded-md border px-3 py-1.5 text-sm"
                >
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={5}
                    aria-label={`Roll ${index + 1} chance`}
                    value={Math.round(roll.chance * 100)}
                    onChange={(event) => {
                      const percent = Number(event.target.value)
                      if (Number.isNaN(percent)) return
                      patch({
                        contentRolls: template.contentRolls.map((r, i) =>
                          i === index
                            ? {
                                ...r,
                                chance:
                                  Math.min(100, Math.max(0, percent)) / 100,
                              }
                            : r
                        ),
                      })
                    }}
                    className="w-20 tabular-nums"
                  />
                  <span className="text-muted-foreground">% chance on</span>
                  <DataSelect
                    className="w-44"
                    placeholder="Missing table"
                    options={tableOptions}
                    optionValue={({ tableKey }) => tableKey}
                    optionLabel={({ table }) =>
                      table!.name.trim() || "Untitled table"
                    }
                    value={roll.tableKey}
                    onValueChange={(tableKey) =>
                      patch({
                        contentRolls: template.contentRolls.map((r, i) =>
                          i === index ? { ...r, tableKey } : r
                        ),
                      })
                    }
                  />
                  <Button
                    variant="ghost"
                    size="icon-sm"
                    className="ml-auto"
                    aria-label={`Remove content roll ${index + 1}`}
                    onClick={() =>
                      patch({
                        contentRolls: template.contentRolls.filter(
                          (_, i) => i !== index
                        ),
                      })
                    }
                  >
                    <XIcon />
                  </Button>
                </li>
              )
            })}
          </ul>
        )}
        <Button
          variant="outline"
          size="sm"
          className="self-start"
          disabled={tableOptions.length === 0}
          onClick={() => {
            const firstTable = tableOptions[0]
            if (!firstTable) return
            patch({
              contentRolls: [
                ...template.contentRolls,
                { chance: 0.5, tableKey: firstTable.tableKey },
              ],
            })
          }}
        >
          <PlusIcon /> Add content roll
        </Button>
        {tableOptions.length === 0 && (
          <p className="text-xs text-muted-foreground">
            Author a table first — content rolls draw from set-level tables.
          </p>
        )}
      </div>

      <Separator />

      <div className="flex flex-wrap items-center gap-2">
        {template.tombstoned ? (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onApplyEvent({ kind: "restoreTemplate", key })}
          >
            Restore template
          </Button>
        ) : (
          <Button
            variant="outline"
            size="sm"
            onClick={() => onApplyEvent({ kind: "tombstoneTemplate", key })}
          >
            Tombstone template
          </Button>
        )}
        <Button
          variant="outline"
          size="sm"
          className="text-destructive"
          onClick={() => {
            const remainsReferenced = referencedTemplateKeys(content).has(key)
            onApplyEvent({ kind: "removeTemplate", key })
            if (!remainsReferenced) onSelect({ kind: "settings" })
          }}
        >
          Delete template
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">
        A tombstoned template stops appearing in random rolls but keeps
        resolving existing references. Deleting a referenced template tombstones
        it instead.
      </p>
    </div>
  )
}

/** The site block behind a toggle: declaring this template a **site** (with
 *  checklist defaults) — required for unique/portal templates, which the
 *  delve-setup checklist lists (lint flags them when this is off). */
function SiteSection({
  template,
  onPatch,
}: {
  template: ZoneTemplate
  onPatch: (update: TemplatePatch) => void
}) {
  const site = template.site

  return (
    <div className="flex flex-col gap-3 rounded-md border p-4">
      <div className="flex items-center justify-between gap-3">
        <div className="flex flex-col gap-0.5">
          <Label htmlFor="template-site">Site declaration defaults</Label>
          <p className="text-xs text-muted-foreground">
            Sites (unique or portal templates) appear on the delve-setup
            checklist with these defaults.
          </p>
        </div>
        <Switch
          id="template-site"
          checked={site !== undefined}
          onCheckedChange={(on) =>
            onPatch({
              site: on
                ? {
                    appearByDefault: false,
                    defaultMinDepth: 0,
                    defaultUrgency: "eventually",
                  }
                : null,
            })
          }
        />
      </div>

      {site && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={site.appearByDefault}
              onCheckedChange={(appearByDefault) =>
                onPatch({ site: { ...site, appearByDefault } })
              }
            />
            Pre-ticked by default
          </label>
          <Field>
            <FieldLabel htmlFor="site-min-depth">Min depth</FieldLabel>
            <Input
              id="site-min-depth"
              type="number"
              min={0}
              value={site.defaultMinDepth}
              onChange={(event) => {
                const depth = Number(event.target.value)
                if (!Number.isNaN(depth))
                  onPatch({
                    site: {
                      ...site,
                      defaultMinDepth: Math.max(0, Math.round(depth)),
                    },
                  })
              }}
              className="w-24 tabular-nums"
            />
          </Field>
          <Field>
            <FieldLabel>Urgency</FieldLabel>
            <DataSelect
              options={[
                { value: "session", label: "This session" },
                { value: "eventually", label: "Eventually" },
              ]}
              optionValue={(option) => option.value}
              optionLabel={(option) => option.label}
              value={site.defaultUrgency}
              onValueChange={(defaultUrgency) =>
                onPatch({
                  site: {
                    ...site,
                    defaultUrgency: defaultUrgency as "session" | "eventually",
                  },
                })
              }
            />
          </Field>
        </div>
      )}
    </div>
  )
}
