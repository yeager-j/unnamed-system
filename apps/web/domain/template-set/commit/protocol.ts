import { z } from "zod/v4"

import { defineMutation, defineProtocol } from "@workspace/headcanon"
import { err, ok, type Result } from "@workspace/result"

import type { TemplateSetContent } from "../authoring"
import {
  reduceTemplateSetEvents,
  templateSetEventSchema,
  type TemplateSetEvent,
} from "../events"

export interface TemplateSetCanonValue {
  name: string
  content: TemplateSetContent
}

export const templateSetRenameArgs = z.object({
  templateSetId: z.string().min(1),
  name: z.string().trim().min(1).max(100),
})

export const templateSetEventsArgs = z.object({
  templateSetId: z.string().min(1),
  events: z.array(templateSetEventSchema).min(1),
})

export type TemplateSetRenameArgs = z.infer<typeof templateSetRenameArgs>
export type TemplateSetEventsArgs = z.infer<typeof templateSetEventsArgs>

export const templateSetRename = defineMutation({
  name: "template-set.rename",
  args: templateSetRenameArgs,
  refusal: z.never(),
  predict(
    state: TemplateSetCanonValue,
    args: TemplateSetRenameArgs
  ): Result<TemplateSetCanonValue, never> {
    return ok({ ...state, name: args.name })
  },
})

export const templateSetEvents = defineMutation({
  name: "template-set.events",
  args: templateSetEventsArgs,
  refusal: z.literal("template-set-event-refused"),
  predict(
    state: TemplateSetCanonValue,
    args: TemplateSetEventsArgs
  ): Result<TemplateSetCanonValue, "template-set-event-refused"> {
    try {
      return ok({
        ...state,
        content: reduceTemplateSetEvents(state.content, args.events),
      })
    } catch {
      return err("template-set-event-refused")
    }
  },
})

export const templateSetProtocol = defineProtocol({
  id: "showtime.template-set.v1",
  mutations: [templateSetRename, templateSetEvents],
})

export type { TemplateSetEvent }
