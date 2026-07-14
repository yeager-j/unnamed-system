// @vitest-environment jsdom

import {
  acceptCompletion,
  currentCompletions,
  setSelectedCompletion,
  startCompletion,
} from "@codemirror/autocomplete"
import { markdown } from "@codemirror/lang-markdown"
import { EditorState } from "@codemirror/state"
import { EditorView } from "@codemirror/view"
import { toast } from "sonner"
import { afterEach, describe, expect, it, vi } from "vitest"

import type { LinkerOption } from "@/domain/planner/view/linker"

import {
  createParticipantLinkExtensions,
  createParticipantLinkWorld,
  type ParticipantLinkTarget,
} from "./participant-links"

vi.mock("sonner", () => ({
  toast: {
    error: vi.fn(),
    success: vi.fn(),
  },
}))

class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.stubGlobal("ResizeObserver", ResizeObserverStub)
Object.defineProperty(HTMLElement.prototype, "scrollIntoView", {
  value: () => {},
})
Object.defineProperties(Range.prototype, {
  getBoundingClientRect: {
    value: () => new DOMRect(0, 0, 1, 16),
  },
  getClientRects: {
    value: () => [new DOMRect(0, 0, 1, 16)] as unknown as DOMRectList,
  },
})

const NPC_OPTION: LinkerOption = {
  ref: { kind: "npc", id: "n1", label: "Maren" },
  label: "Maren",
  sublabel: "The Moon · Warlock",
  iconKey: "npc",
}

const NPC_TARGET: ParticipantLinkTarget = {
  ref: NPC_OPTION.ref,
  label: "Maren",
  tombstoned: false,
}

const views: EditorView[] = []

afterEach(() => {
  for (const view of views.splice(0)) view.destroy()
  document.body.replaceChildren()
  vi.clearAllMocks()
})

function createWorld(
  options: readonly LinkerOption[] = [NPC_OPTION],
  targets: readonly ParticipantLinkTarget[] = [NPC_TARGET]
) {
  return createParticipantLinkWorld({ options, targets })
}

function mount(
  doc: string,
  input?: {
    world?: ReturnType<typeof createParticipantLinkWorld>
    selection?: number
    navigate?: (href: string) => void
    mint?: (
      kind: "npc" | "article",
      campaignId: string,
      name: string
    ) => Promise<ParticipantLinkTarget["ref"] | null>
  }
) {
  const world =
    input?.world ??
    createParticipantLinkWorld({
      options: [NPC_OPTION],
      targets: [NPC_TARGET],
    })
  const navigate = input?.navigate ?? vi.fn()
  const mint = input?.mint ?? vi.fn(async () => null)
  const host = document.createElement("div")
  document.body.append(host)
  const view = new EditorView({
    parent: host,
    state: EditorState.create({
      doc,
      selection: { anchor: input?.selection ?? doc.length },
      extensions: [
        markdown(),
        createParticipantLinkExtensions({
          campaignId: "campaign-1",
          campaignShortId: "camp1234",
          world,
          navigate,
          mint,
          debounceMs: 0,
        }),
      ],
    }),
  })
  views.push(view)
  return { host, view, world, navigate, mint }
}

async function completionsOf(view: EditorView) {
  startCompletion(view)
  await vi.waitFor(() => {
    expect(currentCompletions(view.state).length).toBeGreaterThan(0)
  })
  return currentCompletions(view.state)
}

async function chooseCompletion(view: EditorView, label: string) {
  const completions = await completionsOf(view)
  const index = completions.findIndex(
    (completion) => completion.label === label
  )
  expect(index).toBeGreaterThanOrEqual(0)
  view.dispatch({ effects: setSelectedCompletion(index) })
  await new Promise((resolve) => window.setTimeout(resolve, 80))
  expect(acceptCompletion(view)).toBe(true)
}

describe("participant link decorations", () => {
  it("creates the editor with every source under one autocomplete owner", () => {
    expect(() => mount("Type @ or [[")).not.toThrow()
  })

  it("replaces a stored alias with the current live label", () => {
    const { host } = mount("[[npc:n1|Stored Maren]] after")

    const pill = host.querySelector<HTMLElement>(".cm-participant-link")
    expect(pill?.textContent).toBe("Maren")
    expect(pill?.dataset.wikiLinkTarget).toBe("npc:n1")
    expect(pill?.dataset.participantStatus).toBe("resolved")
  })

  it("refreshes rename, tombstone, and missing state without changing markdown", () => {
    const { host, view, world } = mount("[[npc:n1|Stored Maren]] after")

    world.replace({
      options: [{ ...NPC_OPTION, label: "Captain Maren" }],
      targets: [{ ...NPC_TARGET, label: "Captain Maren", tombstoned: false }],
    })
    expect(
      host.querySelector<HTMLElement>(".cm-participant-link")?.textContent
    ).toBe("Captain Maren")

    world.replace({
      options: [],
      targets: [{ ...NPC_TARGET, label: "Captain Maren", tombstoned: true }],
    })
    expect(
      host.querySelector<HTMLElement>(".cm-participant-link")?.dataset
        .participantStatus
    ).toBe("tombstoned")

    world.replace({ options: [], targets: [] })
    const missing = host.querySelector<HTMLElement>(".cm-participant-link")
    expect(missing?.textContent).toBe("Stored Maren")
    expect(missing?.dataset.participantStatus).toBe("missing")
    expect(view.state.doc.toString()).toBe("[[npc:n1|Stored Maren]] after")
  })

  it("reveals selected source and leaves tokens inside code untouched", () => {
    const active = mount("[[npc:n1|Maren]] after")
    active.view.dispatch({ selection: { anchor: 5 } })
    expect(active.host.querySelector(".cm-participant-link")).toBeNull()
    expect(active.host.textContent).toContain("[[npc:n1|Maren]]")

    const code = mount("Code: `[[npc:n1|Maren]]`")
    expect(code.host.querySelector(".cm-participant-link")).toBeNull()
    expect(code.host.textContent).toContain("[[npc:n1|Maren]]")
  })

  it("unsubscribes from the world when the editor is destroyed", () => {
    const unsubscribe = vi.fn()
    const world = createWorld()
    const subscribe = vi
      .spyOn(world, "subscribe")
      .mockImplementation(() => unsubscribe)
    const { view } = mount("[[npc:n1|Maren]] after", { world })

    view.destroy()

    expect(subscribe).toHaveBeenCalledOnce()
    expect(unsubscribe).toHaveBeenCalledOnce()
  })

  it("navigates live targets with app paths and ignores unavailable targets", () => {
    const article: ParticipantLinkTarget = {
      ref: { kind: "article", id: "a1", label: "Saltmere" },
      label: "Saltmere",
      tombstoned: false,
    }
    const character: ParticipantLinkTarget = {
      ref: { kind: "character", id: "c1", label: "Vell" },
      label: "Vell",
      tombstoned: false,
      characterShortId: "vell1234",
    }
    const world = createWorld([], [NPC_TARGET, article, character])
    const navigate = vi.fn()
    const { host } = mount(
      "[[npc:n1|Maren]] [[article:a1|Saltmere]] [[character:c1|Vell]] after",
      { world, navigate }
    )

    for (const pill of host.querySelectorAll<HTMLElement>(
      ".cm-participant-link"
    )) {
      pill.click()
    }

    expect(navigate.mock.calls).toEqual([
      ["/campaigns/camp1234/npcs/n1"],
      ["/campaigns/camp1234/articles/a1"],
      ["/characters/vell1234"],
    ])

    world.replace({
      options: [],
      targets: [{ ...NPC_TARGET, tombstoned: true }],
    })
    host.querySelector<HTMLElement>(".cm-participant-link")?.click()
    expect(navigate).toHaveBeenCalledTimes(3)
  })
})

describe("participant completions", () => {
  const OPTIONS: LinkerOption[] = [
    NPC_OPTION,
    {
      ref: { kind: "article", id: "a1", label: "Saltmere" },
      label: "Saltmere",
      sublabel: "Settlement",
      iconKey: "settlement",
    },
    {
      ref: { kind: "character", id: "c1", label: "Vell" },
      label: "Vell",
      sublabel: "Level 4 · Warrior",
      iconKey: "character",
    },
  ]

  it.each([
    ["@Mar", "Maren", "[[npc:n1|Maren]] "],
    ["@Salt", "Saltmere", "[[article:a1|Saltmere]] "],
    ["@Vell", "Vell", "[[character:c1|Vell]] "],
  ])(
    "serializes %s through the selected world row",
    async (doc, label, token) => {
      const world = createWorld(OPTIONS, [
        NPC_TARGET,
        {
          ref: OPTIONS[1]!.ref,
          label: OPTIONS[1]!.label,
          tombstoned: false,
        },
        {
          ref: OPTIONS[2]!.ref,
          label: OPTIONS[2]!.label,
          tombstoned: false,
          characterShortId: "vell1234",
        },
      ])
      const { view } = mount(doc, { world })

      await chooseCompletion(view, label)

      expect(view.state.doc.toString()).toBe(token)
    }
  )

  it("sanitizes labels and consumes an existing bracket closer", async () => {
    const hostile = {
      ...NPC_OPTION,
      ref: { ...NPC_OPTION.ref, label: "Maren | the [Hollow]" },
      label: "Maren | the [Hollow]",
    }
    const { view } = mount("[[Maren]]", {
      world: createWorld([hostile], [NPC_TARGET]),
      selection: "[[Maren".length,
    })

    await chooseCompletion(view, hostile.label)

    expect(view.state.doc.toString()).toBe("[[npc:n1|Maren  the Hollow]] ")
  })

  it("gates @ to a word boundary and suppresses both triggers in code", async () => {
    for (const doc of [
      "email@example",
      "`@Maren`",
      "`[[Maren`",
      "```md\n@Maren\n```",
      "```md\n[[Maren\n```",
    ]) {
      const { view } = mount(doc, {
        selection: doc.includes("\n") ? doc.indexOf("Maren") + 5 : doc.length,
      })
      startCompletion(view)
      await new Promise((resolve) => window.setTimeout(resolve, 0))
      expect(currentCompletions(view.state)).toHaveLength(0)
    }
  })

  it("reads replaced world options and caps rows at eight", async () => {
    const initial = Array.from(
      { length: 10 },
      (_, index): LinkerOption => ({
        ref: { kind: "npc", id: `n${index}`, label: `Old ${index}` },
        label: `Old ${index}`,
        sublabel: null,
        iconKey: "npc",
      })
    )
    const world = createWorld(initial, [])
    world.replace({
      options: initial.map((option, index) => ({
        ...option,
        ref: { ...option.ref, label: `New ${index}` },
        label: `New ${index}`,
      })),
      targets: [],
    })
    const { view } = mount("@New", { world })

    const completions = await completionsOf(view)

    expect(
      completions.filter(
        (completion) => !completion.label.startsWith("Create “")
      )
    ).toHaveLength(8)
    expect(completions.some((completion) => completion.label === "Old 0")).toBe(
      false
    )
  })

  it("renders shadcn sections, details, and mint rows", async () => {
    const { view } = mount("@Mar")

    await completionsOf(view)
    await vi.waitFor(() => {
      expect(
        document.querySelector("[data-participant-completion-menu]")
      ).not.toBeNull()
    })

    expect(document.querySelector('[data-slot="command"]')).not.toBeNull()
    expect(
      document.querySelectorAll('[data-slot="command-group"]')
    ).toHaveLength(2)
    expect(document.querySelector('[data-slot="command-input"]')).toBeNull()
    expect(document.body.textContent).toContain("From the world web")
    expect(document.body.textContent).toContain("The Moon · Warlock")
    expect(document.body.textContent).toContain("Create “Mar” as NPC")
    expect(document.body.textContent).toContain("Create “Mar” as Article")
  })
})

describe("controlled participant completion menu", () => {
  it("renders shadcn groups without a focus-owning command input", async () => {
    const { view } = mount("@Mar")

    await completionsOf(view)
    await vi.waitFor(() => {
      expect(
        document.querySelector("[data-participant-completion-menu]")
      ).not.toBeNull()
    })

    expect(document.body.textContent).toContain("From the world web")
    expect(document.body.textContent).toContain("Create")
    expect(document.querySelector('[data-slot="command-input"]')).toBeNull()
  })

  it("mirrors CodeMirror selection into the controlled row", async () => {
    const { view } = mount("@Mar")

    await completionsOf(view)
    view.dispatch({ effects: setSelectedCompletion(1) })

    await vi.waitFor(() => {
      expect(
        document
          .querySelector('[data-participant-completion-index="1"]')
          ?.getAttribute("data-selected")
      ).toBe("true")
    })
  })

  it("applies pointer selection without moving focus from the editor", async () => {
    const { view } = mount("@Mar")

    await completionsOf(view)
    view.focus()
    const row = await vi.waitFor(() => {
      const found = document.querySelector<HTMLElement>(
        '[data-participant-completion-index="0"]'
      )
      expect(found).not.toBeNull()
      return found!
    })
    await new Promise((resolve) => window.setTimeout(resolve, 80))

    const mouseDown = new MouseEvent("mousedown", {
      bubbles: true,
      cancelable: true,
    })
    row.dispatchEvent(mouseDown)

    expect(mouseDown.defaultPrevented).toBe(true)
    expect(view.hasFocus).toBe(true)
    await vi.waitFor(() => {
      expect(view.state.doc.toString()).toBe("[[npc:n1|Maren]] ")
    })
  })

  it("unmounts and removes its React root with the editor", async () => {
    const { view } = mount("@Mar")

    await completionsOf(view)
    await vi.waitFor(() => {
      expect(
        document.querySelector("[data-participant-completion-menu]")
      ).not.toBeNull()
    })

    view.destroy()
    views.splice(views.indexOf(view), 1)

    await vi.waitFor(() => {
      expect(
        document.querySelector("[data-participant-completion-menu]")
      ).toBeNull()
    })
  })
})

describe("mint completions", () => {
  it("inserts the minted ref and makes it immediately resolvable", async () => {
    let resolveMint!: (ref: ParticipantLinkTarget["ref"] | null) => void
    const mint = vi.fn(
      () =>
        new Promise<ParticipantLinkTarget["ref"] | null>((resolve) => {
          resolveMint = resolve
        })
    )
    const world = createWorld()
    const { view } = mount("@New Friend", { world, mint })

    await chooseCompletion(view, "Create “New Friend” as NPC")
    expect(view.state.doc.toString()).toBe("@New Friend")
    resolveMint({ kind: "npc", id: "new-npc", label: "New Friend" })
    await vi.waitFor(() => {
      expect(view.state.doc.toString()).toBe("[[npc:new-npc|New Friend]] ")
    })
    expect(
      world.getSnapshot().targets.some((target) => target.ref.id === "new-npc")
    ).toBe(true)
  })

  it("does not overwrite text when the captured trigger range changed", async () => {
    let resolveMint!: (ref: ParticipantLinkTarget["ref"] | null) => void
    const mint = vi.fn(
      () =>
        new Promise<ParticipantLinkTarget["ref"] | null>((resolve) => {
          resolveMint = resolve
        })
    )
    const { view } = mount("@New Friend", { mint })

    await chooseCompletion(view, "Create “New Friend” as Article")
    view.dispatch({ changes: { from: 0, insert: "!" } })
    resolveMint({ kind: "article", id: "new-article", label: "New Friend" })
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    expect(view.state.doc.toString()).toBe("!@New Friend")
  })

  it("leaves the trigger untouched when minting fails", async () => {
    const { view } = mount("@New Friend", {
      mint: vi.fn(async () => null),
    })

    await chooseCompletion(view, "Create “New Friend” as NPC")
    await new Promise((resolve) => window.setTimeout(resolve, 0))

    expect(view.state.doc.toString()).toBe("@New Friend")
    expect(toast.error).toHaveBeenCalledWith(
      "Couldn't create New Friend. Try again."
    )
  })

  it("guards a rejected mint without consuming the trigger", async () => {
    const { view } = mount("@New Friend", {
      mint: vi.fn(async () => {
        throw new Error("network down")
      }),
    })

    await chooseCompletion(view, "Create “New Friend” as Article")
    await vi.waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith(
        "Couldn't create New Friend. Try again."
      )
    })

    expect(view.state.doc.toString()).toBe("@New Friend")
  })
})
