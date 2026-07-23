import { describe, expect, it } from "vitest"

import { templateSetContentSchema } from "./authoring"
import { reduceTemplateSetEvent, reduceTemplateSetEvents } from "./events"

const empty = () => templateSetContentSchema.parse({})

describe("TemplateSetEvent", () => {
  it("uses caller-minted keys for additions and duplicates", () => {
    const added = reduceTemplateSetEvent(empty(), {
      kind: "addTemplate",
      key: "template-a",
      name: "Atrium",
    })
    const duplicated = reduceTemplateSetEvent(added, {
      kind: "duplicateTemplate",
      sourceKey: "template-a",
      key: "template-b",
    })

    expect(duplicated.templateOrder).toEqual(["template-a", "template-b"])
    expect(duplicated.templates["template-b"]).toMatchObject({
      key: "template-b",
      name: "Atrium copy",
    })
  })

  it("round-trips explicit clears without undefined on the wire", () => {
    const withTemplate = reduceTemplateSetEvent(empty(), {
      kind: "addTemplate",
      key: "template-a",
    })
    const configured = reduceTemplateSetEvent(withTemplate, {
      kind: "updateTemplate",
      key: "template-a",
      patch: {
        portalMapId: "map-1",
        site: {
          appearByDefault: false,
          defaultMinDepth: 0,
          defaultUrgency: "eventually",
        },
      },
    })
    const cleared = reduceTemplateSetEvent(configured, {
      kind: "updateTemplate",
      key: "template-a",
      patch: { portalMapId: null, site: null },
    })

    expect(cleared.templates["template-a"]?.portalMapId).toBeUndefined()
    expect(cleared.templates["template-a"]?.site).toBeUndefined()
  })

  it("composes disjoint target edits in either authority order", () => {
    const base = reduceTemplateSetEvents(empty(), [
      { kind: "addTemplate", key: "a" },
      { kind: "addTemplate", key: "b" },
    ])
    const first = {
      kind: "updateTemplate",
      key: "a",
      patch: { name: "Atrium" },
    } as const
    const second = {
      kind: "updateTemplate",
      key: "b",
      patch: { name: "Bridge" },
    } as const

    expect(reduceTemplateSetEvents(base, [first, second])).toEqual(
      reduceTemplateSetEvents(base, [second, first])
    )
  })

  it("defines same-target updates as authority-order last intent wins", () => {
    const base = reduceTemplateSetEvent(empty(), {
      kind: "addTemplate",
      key: "a",
    })
    const first = {
      kind: "updateTemplate",
      key: "a",
      patch: { name: "Atrium" },
    } as const
    const second = {
      kind: "updateTemplate",
      key: "a",
      patch: { name: "Archive" },
    } as const

    expect(
      reduceTemplateSetEvents(base, [first, second]).templates.a?.name
    ).toBe("Archive")
  })

  it("refuses caller-minted keys already owned by current content", () => {
    const base = reduceTemplateSetEvent(empty(), {
      kind: "addTemplate",
      key: "a",
    })

    expect(() =>
      reduceTemplateSetEvent(base, { kind: "addTemplate", key: "a" })
    ).toThrow("already used")
  })
})
