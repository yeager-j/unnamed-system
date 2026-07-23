import { beforeEach, describe, expect, it, vi } from "vitest"

import { createStampAccumulator } from "@workspace/headcanon"
import { MutationContentionError } from "@workspace/headcanon/drizzle"
import { err, ok } from "@workspace/result"

import { templateSetContentSchema } from "@/domain/template-set/authoring"
import { templateSetAxis } from "@/lib/db/axes"
import type { TemplateSetRow } from "@/lib/db/schema/template-set"

const loadTemplateSetRowById = vi.fn()
const renameTemplateSet = vi.fn()
const saveTemplateSetContent = vi.fn()

vi.mock("server-only", () => ({}))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("@/lib/db/queries/load-template-set", () => ({
  loadTemplateSetRowById: (...args: unknown[]) =>
    loadTemplateSetRowById(...args),
}))
vi.mock("@/lib/db/writes/template-set", () => ({
  renameTemplateSet: (...args: unknown[]) => renameTemplateSet(...args),
  saveTemplateSetContent: (...args: unknown[]) =>
    saveTemplateSetContent(...args),
}))

const { templateSetEventsCommand, templateSetRenameCommand } =
  await import("./commands")

const actor = { userId: "user-1", email: "user@example.com" }
const mutationId = "00000000-0000-4000-8000-000000000001"
const set = {
  id: "set-1",
  shortId: "set-short",
  userId: actor.userId,
  name: "Grammar",
  content: templateSetContentSchema.parse({}),
  version: 5,
  createdAt: new Date(),
  updatedAt: new Date(),
  deletedAt: null,
} satisfies TemplateSetRow
const tx = {} as Parameters<typeof templateSetEventsCommand.execute>[0]["tx"]

beforeEach(() => {
  vi.clearAllMocks()
  loadTemplateSetRowById.mockResolvedValue(set)
  renameTemplateSet.mockResolvedValue(ok({ version: 6 }))
  saveTemplateSetContent.mockResolvedValue(ok({ version: 6 }))
})

describe("template set mutation commands", () => {
  it("screens and rechecks live ownership inside the authority attempt", async () => {
    loadTemplateSetRowById.mockResolvedValueOnce({ ...set, userId: "other" })

    await expect(
      templateSetRenameCommand.screen({
        executor: tx,
        actor,
        args: { templateSetId: set.id, name: "Codex" },
      })
    ).resolves.toEqual({ kind: "denied" })

    loadTemplateSetRowById.mockResolvedValueOnce(null)
    await expect(
      templateSetRenameCommand.admit({
        tx,
        actor,
        args: { templateSetId: set.id, name: "Codex" },
      })
    ).resolves.toEqual({ kind: "denied" })
    expect(loadTemplateSetRowById).toHaveBeenLastCalledWith(set.id, tx)
  })

  it("reduces events over current content and stamps the guarded write", async () => {
    const stamp = createStampAccumulator()
    const decision = await templateSetEventsCommand.execute({
      tx,
      actor,
      args: {
        templateSetId: set.id,
        events: [{ kind: "addTemplate", key: "template-a" }],
      },
      evidence: set,
      stamp,
      mutationId,
    })

    expect(decision).toEqual({ kind: "accepted" })
    expect(saveTemplateSetContent).toHaveBeenCalledWith(
      set.id,
      expect.objectContaining({
        templates: expect.objectContaining({
          "template-a": expect.any(Object),
        }),
      }),
      set.version,
      tx
    )
    expect(stamp.accepted().revisions[templateSetAxis(set.id)]).toBe(6)
  })

  it("refuses an event invalidated by current content without writing", async () => {
    const stamp = createStampAccumulator()
    const decision = await templateSetEventsCommand.execute({
      tx,
      actor,
      args: {
        templateSetId: set.id,
        events: [
          { kind: "updateTemplate", key: "missing", patch: { name: "Gone" } },
        ],
      },
      evidence: set,
      stamp,
      mutationId,
    })

    expect(decision).toEqual({
      kind: "refused",
      error: "template-set-event-refused",
    })
    expect(saveTemplateSetContent).not.toHaveBeenCalled()
    expect(stamp.accepted().revisions).toEqual({})
  })

  it("turns a lost row guard into whole-command contention", async () => {
    saveTemplateSetContent.mockResolvedValue(err("stale"))

    await expect(
      templateSetEventsCommand.execute({
        tx,
        actor,
        args: {
          templateSetId: set.id,
          events: [{ kind: "addTable", key: "table-a" }],
        },
        evidence: set,
        stamp: createStampAccumulator(),
        mutationId,
      })
    ).rejects.toBeInstanceOf(MutationContentionError)
  })
})
