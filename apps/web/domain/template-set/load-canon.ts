import { defineCanon, type Canon } from "@workspace/headcanon"

import type { TemplateSetCanonValue } from "@/domain/template-set/commit/protocol"
import { templateSetAxis } from "@/lib/db/axes"
import type { TemplateSetRow } from "@/lib/db/schema/template-set"

export function toTemplateSetCanon(
  set: Pick<TemplateSetRow, "id" | "name" | "content" | "version">
): Canon<TemplateSetCanonValue> {
  return defineCanon({
    value: { name: set.name, content: set.content },
    revisions: { [templateSetAxis(set.id)]: set.version },
  })
}
