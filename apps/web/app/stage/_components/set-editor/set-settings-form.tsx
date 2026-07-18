"use client"

import { DataSelect } from "@workspace/ui/components/data-select"
import {
  Field,
  FieldDescription,
  FieldLabel,
} from "@workspace/ui/components/field"
import { Input } from "@workspace/ui/components/input"
import { Separator } from "@workspace/ui/components/separator"

import { DeleteSetButton } from "@/app/stage/_components/delete-set-button"
import type { TemplateSetContent } from "@/domain/template-set/authoring"
import {
  setClosureChance,
  setConnectorTemplateKey,
} from "@/domain/template-set/edit"
import type { TemplateSetRow } from "@/lib/db/schema/template-set"

/**
 * The Set settings view — the two set-level knobs plus the delete control. The
 * knobs live on the content blob (not `region.settings`): `closureChance` is
 * the per-set loop-closure probability (authored as a percentage; stored 0..1),
 * and the connector designation names the always-legal template the empty-pool
 * fallback mints (lint checks it's set and universal). This is also the
 * editor's landing view — the only view an empty set can show.
 */
export function SetSettingsForm({
  set,
  setName,
  content,
  onApplyContent,
}: {
  set: TemplateSetRow
  setName: string
  content: TemplateSetContent
  onApplyContent: (content: TemplateSetContent) => void
}) {
  const connectorOptions = content.templateOrder
    .map((key) => ({ key, template: content.templates[key] }))
    .filter(
      (
        option
      ): option is {
        key: string
        template: NonNullable<typeof option.template>
      } => option.template !== undefined && option.template.tombstoned !== true
    )

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-col gap-1">
        <h2 className="font-display text-2xl font-semibold">Set settings</h2>
        <p className="text-sm text-muted-foreground">
          Set-level knobs the generation roll reads. Templates and tables are
          authored from the sidebar.
        </p>
      </header>

      <Field>
        <FieldLabel htmlFor="closure-chance">Closure chance</FieldLabel>
        <div className="flex items-center gap-2">
          <Input
            id="closure-chance"
            type="number"
            min={0}
            max={100}
            step={5}
            value={Math.round(content.closureChance * 100)}
            onChange={(event) => {
              const percent = Number(event.target.value)
              if (Number.isNaN(percent)) return
              onApplyContent(
                setClosureChance(
                  content,
                  Math.min(100, Math.max(0, percent)) / 100
                )
              )
            }}
            className="w-24 tabular-nums"
          />
          <span className="text-sm text-muted-foreground">%</span>
        </div>
        <FieldDescription>
          How often an expansion prefers closing a loop back into an existing
          zone over minting a new one. Low keeps the city tree-like; higher
          feels more street-like.
        </FieldDescription>
      </Field>

      <Field>
        <FieldLabel>Connector template</FieldLabel>
        <DataSelect
          className="w-full max-w-sm"
          placeholder="Missing template"
          nullOption={{ label: "No connector" }}
          options={connectorOptions}
          optionValue={({ key }) => key}
          optionLabel={({ template }) =>
            template.name.trim() || "Untitled template"
          }
          value={content.connectorTemplateKey ?? ""}
          onValueChange={(value) =>
            onApplyContent(setConnectorTemplateKey(content, value || undefined))
          }
        />
        <FieldDescription>
          The always-legal fallback (a hallway, an alley) minted when a socket
          has no legal candidates. Without one, an empty pool becomes a narrated
          dead end. The lint checks it pairs with every template.
        </FieldDescription>
      </Field>

      {content.templateOrder.length === 0 && (
        <p className="text-sm text-muted-foreground">
          This set has no templates yet — add one from the sidebar to start
          authoring, then designate a connector here.
        </p>
      )}

      <Separator />

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-medium">Danger zone</h3>
        <DeleteSetButton templateSetId={set.id} setName={setName} />
      </div>
    </div>
  )
}
